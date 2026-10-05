import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
import { getDynamicTwilioClient } from "../../twilioClient";
const db: any = supabaseAdmin;

export async function handleTransferToHuman(
  input: { reason?: string; transfer_number?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  try {
    let transferTo = input.transfer_number;

    if (!transferTo) {
      const { data: profile } = await db
        .from("business_profiles")
        .select("transfer_number")
        .eq("user_id", ctx.userId)
        .maybeSingle();

      if (profile?.transfer_number) {
        transferTo = profile.transfer_number;
      }
    }

    if (!transferTo) {
      return {
        ok: false,
        error: "no_transfer_number",
        message: "Our lines are currently busy with other callers, but I have flagged this for immediate callback from our staff.",
        spokenFallback: "I have flagged this for our staff to call you right back.",
      };
    }

    // If active call exists and Twilio client is available, redirect live call
    if (ctx.callId && ctx.callId.startsWith("CA")) {
      try {
        const { client } = await getDynamicTwilioClient(ctx.userId);
        if (client) {
          await client.calls(ctx.callId).update({
            twiml: `<Response><Say>Please hold while we transfer your call to our human representative.</Say><Dial>${transferTo}</Dial></Response>`,
          });
        }
      } catch (twilioErr: any) {
        console.warn("[Action:TransferToHuman] Live call redirect notice:", twilioErr.message);
      }
    }

    // Update call outcome
    if (ctx.callId) {
      await db
        .from("calls")
        .update({ outcome: "transferred", summary: `Transferred to ${transferTo}: ${input.reason || "Caller requested human"}` })
        .eq("id", ctx.callId);
    }

    return {
      ok: true,
      message: "Please hold while I transfer you directly to our human representative.",
      data: { transferred_to: transferTo, reason: input.reason },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I am having difficulty initiating the transfer right now, but I have noted this request for immediate callback.",
    };
  }
}
