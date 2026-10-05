import { Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { hangupCall } from "../twilioClient";
import { AuthenticatedRequest } from "../middleware/auth";

export async function handleEndCall(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // 1. Fetch Call Record to get Twilio CallSid
    const { data: call, error } = await (supabaseAdmin as any)
      .from("calls")
      .select("*")
      .eq("id", callId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !call) {
      res.status(404).json({ error: "Call record not found." });
      return;
    }

    if (call.outcome !== "in_progress") {
      res.status(400).json({ error: "Call is not active." });
      return;
    }

    console.log(`[EndCall] Requesting manual hangup for Call ${callId}`);

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
    console.error(`[EndCall] Error ending call ${callId}:`, err);
    res.status(500).json({ error: err.message || "Failed to terminate call." });
  }
}
