import { ActionContext, ActionResult } from "../types";
import { hangupCall } from "../../twilioClient";

export async function handleEndCallAction(
  input: { reason?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  try {
    if (ctx.callId) {
      setTimeout(async () => {
        try {
          await hangupCall(ctx.callId!);
        } catch {}
      }, 1500);
    }

    return {
      ok: true,
      message: "Thank you for calling. Have a wonderful day! Goodbye.",
      data: { action: "end_call", reason: input.reason },
    };
  } catch (err: any) {
    return {
      ok: true,
      message: "Thank you for calling. Goodbye!",
      data: { action: "end_call" },
    };
  }
}
