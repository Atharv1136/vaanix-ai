import { Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { hangupCall } from "../twilioClient";

export async function handleEndCall(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    // 1. Fetch Call Record to get Twilio CallSid
    const { data: call, error } = await supabaseAdmin
      .from("calls")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !call) {
      res.status(404).json({ error: "Call record not found." });
      return;
    }

    if (call.outcome !== "in_progress") {
      res.status(400).json({ error: "Call is not active." });
      return;
    }

    console.log(`[EndCall] Requesting manual hangup for Call ${id}`);

    // 2. Trigger hangup in Twilio
    // Twilio CallSid is logged as the primary ID (or can be looked up from line tracking)
    // For simplicity of inbound/outbound legs, we trigger Completed using call ID
    const hungup = await hangupCall(call.id);

    if (hungup) {
      res.status(200).json({ message: "Call terminated successfully." });
    } else {
      res.status(500).json({ error: "Failed to request Twilio hangup." });
    }
  } catch (err: any) {
    console.error(`[EndCall] Error ending call ${id}:`, err);
    res.status(500).json({ error: err.message || "Failed to terminate call." });
  }
}
