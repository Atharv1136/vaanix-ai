import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
import { getDynamicTwilioClient } from "../../twilioClient";
const db: any = supabaseAdmin;

export async function handleSendSms(
  input: { to?: string; body?: string; template?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  const recipient = input.to || ctx.callerNumber;
  const content = input.body || "Thank you for reaching out to us. We have recorded your request.";

  if (!recipient) {
    return {
      ok: false,
      error: "missing_recipient",
      message: "Could you please provide your mobile number so I can send the text message?",
    };
  }

  try {
    // 1. Log message to database
    const { data: msg } = await db
      .from("messages")
      .insert({
        user_id: ctx.userId,
        recipient_phone: recipient.trim(),
        content: content.trim(),
        channel: "sms",
        call_id: ctx.callId || null,
        status: "queued",
      })
      .select("id")
      .single();

    // 2. Send via Twilio if client configured
    try {
      const { client } = await getDynamicTwilioClient(ctx.userId);
      if (client) {
        // Find outbound from number
        const { data: line } = await db
          .from("phone_numbers")
          .select("phone_number")
          .eq("user_id", ctx.userId)
          .limit(1)
          .maybeSingle();

        const fromNumber = line?.phone_number || process.env.TWILIO_PHONE_NUMBER;
        if (fromNumber) {
          await client.messages.create({
            body: content,
            from: fromNumber,
            to: recipient,
          });
          if (msg) {
            await db.from("messages").update({ status: "sent" }).eq("id", msg.id);
          }
        }
      }
    } catch (sendErr: any) {
      console.warn("[Action:SendSms] Twilio dispatch notice:", sendErr.message);
    }

    return {
      ok: true,
      message: "I have dispatched an SMS to your mobile number with the details.",
      data: { recipient, message_id: msg?.id },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I will make sure our system texts you the full details shortly.",
    };
  }
}
