import { ActionContext, ActionResult } from "./types";
import { ACTION_REGISTRY } from "./registry";
import { supabaseAdmin } from "../supabase";
const db: any = supabaseAdmin;

export async function executeAction(
  actionKey: string,
  input: any,
  ctx: ActionContext
): Promise<ActionResult> {
  const startTime = Date.now();
  const def = ACTION_REGISTRY[actionKey];

  if (!def) {
    return {
      ok: false,
      error: "action_not_found",
      message: "I am unable to perform that action right now.",
      spokenFallback: "I cannot perform that request at the moment.",
    };
  }

  let result: ActionResult;
  try {
    // 5-second hard timeout to avoid caller dead air
    const timeoutPromise = new Promise<ActionResult>((_, reject) =>
      setTimeout(() => reject(new Error("action_timeout")), 5000)
    );

    result = await Promise.race([def.handler(input, ctx), timeoutPromise]);
  } catch (err: any) {
    console.error(`[ActionRunner] Failed action ${actionKey}:`, err.message);
    result = {
      ok: false,
      error: err.message || "execution_error",
      message: def.spokenFallback,
      spokenFallback: def.spokenFallback,
    };
  }

  const durationMs = Date.now() - startTime;

  // Log execution into action_runs
  try {
    await db.from("action_runs").insert({
      user_id: ctx.userId,
      call_id: ctx.callId || null,
      agent_id: ctx.agentId || null,
      action_name: actionKey,
      input_payload: input || {},
      output_payload: result.data || { message: result.message },
      status: result.ok ? "success" : "failed",
      error_message: result.error || null,
      latency_ms: durationMs,
    });
  } catch (logErr: any) {
    console.warn("[ActionRunner] Failed logging to action_runs:", logErr.message);
  }

  return result;
}
