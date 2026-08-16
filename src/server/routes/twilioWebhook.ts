import { Request, Response } from "express";
import twilio from "twilio";
import { getPhoneNumber, createCallRecord, getDefaultAssistantId } from "../supabase";
import { getPublicBaseUrl } from "./outbound";

export async function handleTwilioVoiceWebhook(req: Request, res: Response): Promise<void> {
  const { To, From, CallSid, Direction } = req.body;
  // Query params from outbound URL (e.g. /webhooks/twilio/voice?assistant_id=...&call_record_id=...)
  const queryAssistantId = req.query.assistant_id as string | undefined;
  const queryCallRecordId = req.query.call_record_id as string | undefined;
  const queryCallerName = req.query.caller_name as string | undefined;
  const callerName = queryCallerName || req.body.caller_name || "";

  const maskNumber = (num: string) => (num ? `***${num.slice(-4)}` : "unknown");
  console.log(
    `[TwilioWebhook] Call SID ${CallSid?.substring(0, 8)} to ${maskNumber(To)} from ${maskNumber(From)} dir=${Direction}`,
  );

  res.type("text/xml");

  try {
    let assistantId: string | null = null;
    let phoneNumberId: string | null = null;
    let callRecordId: string | null = queryCallRecordId || null;

    // Priority 1: outbound call — assistant_id in query param (set by our /api/outbound/call route)
    if (queryAssistantId) {
      assistantId = queryAssistantId;
      console.log(`[TwilioWebhook] Outbound call using assistant: ${assistantId}`);
    }
    // Priority 2: browser test call (Twilio Client passes it in body)
    else if (req.body.assistantId) {
      assistantId = req.body.assistantId;
      console.log(`[TwilioWebhook] Browser test call for assistant: ${assistantId}`);
    }
    // Priority 3: inbound call — look up by the "To" phone number, or fallback to Default Agent
    else {
      const phoneRecord = await getPhoneNumber(To);
      if (phoneRecord && phoneRecord.assistant_id) {
        assistantId = phoneRecord.assistant_id;
        phoneNumberId = phoneRecord.id;
        console.log(`[TwilioWebhook] Inbound call assigned to assistant: ${assistantId}`);
      } else {
        if (phoneRecord) phoneNumberId = phoneRecord.id;
        assistantId = await getDefaultAssistantId();
        console.log(`[TwilioWebhook] Inbound line ${To} unassigned, using Default Agent: ${assistantId}`);
      }
    }

    if (!assistantId) {
      const response = new twilio.twiml.VoiceResponse();
      response.say("Sorry, assistant not found.");
      res.status(200).send(response.toString());
      return;
    }

    // Create call record only if one wasn't already created by the outbound handler
    if (!callRecordId) {
      callRecordId = await createCallRecord(
        assistantId,
        phoneNumberId,
        From || "browser",
        queryCallRecordId ? "outbound" : "inbound",
      );
    }

    // Return TwiML response to open WebSocket media stream link
    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect();

    const hostHeader = req.headers.host;
    const publicBaseUrl = getPublicBaseUrl() || (hostHeader ? `https://${hostHeader}` : process.env.PUBLIC_BASE_URL || "");
    const rawHost = (hostHeader || publicBaseUrl || "localhost:3000").replace(/^https?:\/\//, "");
    const streamUrl = `wss://${rawHost}/media-stream`;

    console.log(`[TwilioWebhook] Connecting media stream to: ${streamUrl}`);

    const stream = connect.stream({
      url: streamUrl,
    });

    stream.parameter({
      name: "assistant_id",
      value: assistantId,
    });

    if (callRecordId) {
      stream.parameter({
        name: "call_record_id",
        value: callRecordId,
      });
    }

    if (callerName) {
      stream.parameter({
        name: "caller_name",
        value: callerName,
      });
    }

    res.status(200).send(response.toString());
  } catch (error) {
    console.error("[TwilioWebhook] Catastrophic error handling voice webhook:", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say("A system error occurred. Please try again later.");
    res.status(200).send(response.toString());
  }
}
