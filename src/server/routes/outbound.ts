import { Request, Response } from "express";
import { supabaseAdmin, getDefaultAssistantId } from "../supabase";
import { getDynamicTwilioClient } from "../twilioClient";

export let activePublicBaseUrl = "";

export function getPublicBaseUrl(): string {
  return activePublicBaseUrl || process.env.PUBLIC_BASE_URL || "";
}

export function updatePublicBaseUrl(url: string) {
  if (url && url !== activePublicBaseUrl) {
    activePublicBaseUrl = url;
    console.log(`[Config] Dynamically updated PUBLIC_BASE_URL to: ${url}`);
  }
}

function normalizePhoneNumber(raw: string): string {
  let str = (raw || "").trim();
  if (!str) return "";

  // Handle scientific notation (e.g. 9.19562E+11, 9.19562e11)
  if (/^[+\-]?\d+(\.\d+)?[eE][+\-]?\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = Math.round(num).toString();
    }
  }

  const hasPlus = str.startsWith("+");
  const digitsOnly = str.replace(/\D/g, "");

  if (!digitsOnly) return str;

  if (digitsOnly.length === 10) {
    return "+91" + digitsOnly;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return "+" + digitsOnly;
  }
  if (hasPlus) {
    return "+" + digitsOnly;
  }
  return "+" + digitsOnly;
}

// POST /api/outbound/call — single outbound call
export async function handleSingleOutboundCall(req: Request, res: Response): Promise<void> {
  const { student_number, line_id, context_note, caller_name } = req.body;

  const publicBaseUrl = getPublicBaseUrl();
  const { client: twilioClient, credentials } = await getDynamicTwilioClient();

  // Validate required params
  if (!student_number) {
    res.status(400).json({ error: "Missing required parameter: student_number." });
    return;
  }
  if (!twilioClient) {
    res
      .status(500)
      .json({
        error: "Telephony credentials not configured. Please configure Twilio or Plivo in Settings.",
      });
    return;
  }
  if (!publicBaseUrl) {
    res
      .status(500)
      .json({ error: "PUBLIC_BASE_URL is missing. Add your tunnel URL to configuration." });
    return;
  }

  try {
    // Resolve phone line and assistant from phone_numbers table
    let fromNumber = credentials.phoneNumber || process.env.TWILIO_PHONE_NUMBER || "";
    let assistantId = "";

    if (line_id) {
      const { data: line } = await supabaseAdmin
        .from("phone_numbers")
        .select("phone_number, assistant_id")
        .eq("id", line_id)
        .maybeSingle();

      if (line) {
        if (line.phone_number) fromNumber = line.phone_number;
        assistantId = line.assistant_id || "";
      }
    }

    // Extract assistant_id from context_note override if provided
    if (context_note && context_note.startsWith("assistant_id:")) {
      const override = context_note.replace("assistant_id:", "").trim();
      if (override) assistantId = override;
    }

    // Fallback: use Default Agent if none assigned
    if (!assistantId) {
      assistantId = (await getDefaultAssistantId()) || "";
    }

    if (!assistantId) {
      res
        .status(400)
        .json({
          error:
            "No assistant assigned to this line and no published assistant found. Please assign an assistant to the phone number.",
        });
      return;
    }

    const cleanNumber = normalizePhoneNumber(student_number);
    console.log(
      `[SingleOutbound] Dialing: ${cleanNumber} from ${fromNumber} using assistant ${assistantId}`,
    );

    // Create call record in DB
    const { data: call, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        student_or_caller_number: cleanNumber,
        direction: "outbound",
        outcome: "in_progress",
        started_at: new Date().toISOString(),
        assistant_id: assistantId,
        phone_number_id: line_id || null,
      })
      .select("id")
      .single();

    if (callErr || !call) {
      console.error("[SingleOutbound] Failed to create call record:", callErr);
      res.status(500).json({ error: "Failed to create call record in database." });
      return;
    }

    const twilioCall = await twilioClient.calls.create({
      to: cleanNumber,
      from: fromNumber,
      url: `${publicBaseUrl}/webhooks/twilio/voice?assistant_id=${encodeURIComponent(assistantId)}&call_record_id=${encodeURIComponent(call.id)}&caller_name=${encodeURIComponent(caller_name || "")}`,
      statusCallback: `${publicBaseUrl}/webhooks/twilio/status`,
      statusCallbackMethod: "POST",
    });

    console.log(`[SingleOutbound] Call SID: ${twilioCall.sid}`);
    res
      .status(200)
      .json({ message: "Outbound call initiated.", call_id: call.id, twilio_sid: twilioCall.sid });
  } catch (err: any) {
    console.error("[SingleOutbound] Error:", err);
    res.status(500).json({ error: err.message || "Failed to start outbound call." });
  }
}

// POST /api/outbound/start — batch outbound calls
export async function handleOutboundBatch(req: Request, res: Response): Promise<void> {
  const { student_numbers, line_id, context_note } = req.body;

  const publicBaseUrl = getPublicBaseUrl();
  const { client: twilioClient, credentials } = await getDynamicTwilioClient();

  if (!student_numbers || !Array.isArray(student_numbers) || student_numbers.length === 0) {
    res.status(400).json({ error: "Missing required parameter: student_numbers (array)." });
    return;
  }
  if (!twilioClient) {
    res.status(500).json({ error: "Telephony credentials not configured." });
    return;
  }
  if (!publicBaseUrl) {
    res.status(500).json({ error: "Missing PUBLIC_BASE_URL in configuration." });
    return;
  }

  try {
    // Resolve line
    let fromNumber = credentials.phoneNumber || process.env.TWILIO_PHONE_NUMBER || "";
    let assistantId = "";

    if (line_id) {
      const { data: line } = await supabaseAdmin
        .from("phone_numbers")
        .select("phone_number, assistant_id")
        .eq("id", line_id)
        .maybeSingle();
      if (line) {
        if (line.phone_number) fromNumber = line.phone_number;
        assistantId = line.assistant_id || "";
      }
    }

    if (!assistantId) {
      const { data: fallback } = await supabaseAdmin
        .from("assistants")
        .select("id")
        .eq("is_published", true)
        .limit(1)
        .maybeSingle();
      if (fallback) assistantId = fallback.id;
    }

    const batchId = `batch_${Date.now()}`;
    console.log(`[OutboundBatch] Starting batch ${batchId} with ${student_numbers.length} numbers`);

    // Fire calls in background
    setTimeout(async () => {
      const concurrencyCap = 3;
      const queue = [...student_numbers];

      const dialNext = async () => {
        if (queue.length === 0) return;
        const number = queue.shift();
        if (!number) return;

        try {
          const cleanNumber = normalizePhoneNumber(number);
          console.log(`[OutboundBatch] Dialing: ${cleanNumber}`);

          const { data: call } = await supabaseAdmin
            .from("calls")
            .insert({
              student_or_caller_number: cleanNumber,
              direction: "outbound",
              outcome: "in_progress",
              started_at: new Date().toISOString(),
              assistant_id: assistantId || null,
              phone_number_id: line_id || null,
            })
            .select("id")
            .single();

          if (call && assistantId) {
            await twilioClient!.calls.create({
              to: cleanNumber,
              from: fromNumber,
              url: `${publicBaseUrl}/webhooks/twilio/voice?assistant_id=${encodeURIComponent(assistantId)}&call_record_id=${encodeURIComponent(call.id)}`,
            });
          }
        } catch (err) {
          console.error(`[OutboundBatch] Error dialing:`, err);
        }
        dialNext();
      };

      for (let i = 0; i < Math.min(concurrencyCap, student_numbers.length); i++) {
        dialNext();
      }
    }, 0);

    res
      .status(200)
      .json({ message: "Batch started.", batch_id: batchId, count: student_numbers.length });
  } catch (err: any) {
    console.error("[OutboundBatch] Error:", err);
    res.status(500).json({ error: err.message || "Failed to start batch." });
  }
}
