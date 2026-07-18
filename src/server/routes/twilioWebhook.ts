import { Request, Response } from "express";
import twilio from "twilio";
import { getCallLine, createCallRecord } from "../supabase";

export async function handleTwilioVoiceWebhook(req: Request, res: Response): Promise<void> {
  const { To, From, CallSid } = req.body;

  // Mask details for logs
  const maskNumber = (num: string) => num ? `***${num.slice(-4)}` : "unknown";
  console.log(`[TwilioWebhook] Incoming call SID ${CallSid?.substring(0, 8)} to ${maskNumber(To)} from ${maskNumber(From)}`);

  res.type("text/xml");

  try {
    // 1. Fetch matching active line configuration from Supabase
    const line = await getCallLine(To);

    if (!line) {
      console.log(`[TwilioWebhook] Line ${To} not registered in call_lines. Rejecting call.`);
      const response = new twilio.twiml.VoiceResponse();
      response.say("Sorry, this line is not registered.");
      res.status(200).send(response.toString());
      return;
    }

    // 2. If AI answering is disabled, redirect call to the staff forwarding desk number immediately
    if (!line.ai_enabled) {
      console.log(`[TwilioWebhook] AI answering disabled for line ${To}. Redirecting call.`);
      const response = new twilio.twiml.VoiceResponse();
      if (line.forward_to) {
        response.dial(line.forward_to);
      } else {
        response.say("No forwarding number configured.");
      }
      res.status(200).send(response.toString());
      return;
    }

    // 3. Create call record row in Supabase
    const callRecordId = await createCallRecord(From || "unknown", "inbound", line.id);

    // 4. Return TwiML response to open WebSocket media stream link
    const response = new twilio.twiml.VoiceResponse();
    response.say("Welcome to the college admission cell assistant.");
    
    const connect = response.connect();
    // Pass custom parameters so websocket handler knows who to forward to and what call ID matches
    const stream = connect.stream({
      url: `wss://${req.headers.host}/media-stream`,
    });
    
    stream.parameter({
      name: "forward_to",
      value: line.forward_to || "",
    });

    if (callRecordId) {
      stream.parameter({
        name: "call_record_id",
        value: callRecordId,
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
