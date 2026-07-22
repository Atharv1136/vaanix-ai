import { Request, Response } from "express";
import twilio from "twilio";
import { supabaseAdmin, getDefaultAssistantId } from "../supabase";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

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
  const num = raw.trim();
  if (/^\d{10}$/.test(num)) return "+91" + num; // Indian 10-digit
  if (/^\d{12}$/.test(num)) return "+" + num; // 12-digit without +
  if (!num.startsWith("+")) return "+" + num;
  return num;
}

function buildTwiml(
  publicBaseUrl: string,
  callId: string,
  assistantId: string,
  contextNote: string,
): string {
  const wsHost = publicBaseUrl.replace("https://", "").replace("http://", "");
  return `
<Response>
  <Connect>
    <Stream url="wss://${wsHost}/media-stream">
      <Parameter name="assistant_id" value="${assistantId}" />
      <Parameter name="call_record_id" value="${callId}" />
      <Parameter name="context_note" value="${contextNote}" />
    </Stream>
  </Connect>
</Response>`.trim();
}

// POST /api/outbound/call — single outbound call
export async function handleSingleOutboundCall(req: Request, res: Response): Promise<void> {
  const { student_number, line_id, context_note, caller_name } = req.body;

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const publicBaseUrl = getPublicBaseUrl();
  const twilioClient = getTwilioClient();

  // Validate required params
  if (!student_number) {
    res.status(400).json({ error: "Missing required parameter: student_number." });
    return;
  }
  if (!twilioClient) {
    res
      .status(500)
      .json({
        error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).",
      });
    return;
  }
  if (!twilioPhoneNumber) {
    res.status(500).json({ error: "TWILIO_PHONE_NUMBER is missing in .env file." });
    return;
  }
  if (!publicBaseUrl) {
    res
      .status(500)
      .json({ error: "PUBLIC_BASE_URL is missing. Add your tunnel URL to .env (e.g. ngrok)." });
    return;
  }

  try {
    // Resolve phone line and assistant from phone_numbers table
    let fromNumber = twilioPhoneNumber;
    let assistantId = "";

    if (line_id) {
      const { data: line } = await supabaseAdmin
        .from("phone_numbers")
        .select("phone_number, assistant_id")
        .eq("id", line_id)
        .maybeSingle();

      if (line) {
        fromNumber = line.phone_number;
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

    // Initiate Twilio call using URL instead of twiml — so Twilio fetches TwiML from our server
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

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const publicBaseUrl = getPublicBaseUrl();
  const twilioClient = getTwilioClient();

  if (!student_numbers || !Array.isArray(student_numbers) || student_numbers.length === 0) {
    res.status(400).json({ error: "Missing required parameter: student_numbers (array)." });
    return;
  }
  if (!twilioClient) {
    res.status(500).json({ error: "Twilio credentials not configured." });
    return;
  }
  if (!twilioPhoneNumber || !publicBaseUrl) {
    res.status(500).json({ error: "Missing TWILIO_PHONE_NUMBER or PUBLIC_BASE_URL in .env." });
    return;
  }

  try {
    // Resolve line
    let fromNumber = twilioPhoneNumber;
    let assistantId = "";

    if (line_id) {
      const { data: line } = await supabaseAdmin
        .from("phone_numbers")
        .select("phone_number, assistant_id")
        .eq("id", line_id)
        .maybeSingle();
      if (line) {
        fromNumber = line.phone_number;
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
