import { ActionContext, ActionResult } from "../types";
import crypto from "crypto";

export async function handleCallWebhook(
  input: { name: string; args?: Record<string, any>; endpoint?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  const url = input.endpoint || (ctx.config?.url as string);
  if (!url) {
    return {
      ok: false,
      error: "missing_webhook_url",
      message: "Our external system integration is not currently configured for this inquiry.",
      spokenFallback: "I cannot connect to our external database at the moment.",
    };
  }

  try {
    const payload = {
      call_id: ctx.callId,
      agent_id: ctx.agentId,
      user_id: ctx.userId,
      caller_number: ctx.callerNumber,
      action: input.name,
      args: input.args || {},
      timestamp: new Date().toISOString(),
    };

    const secret = (ctx.config?.secret as string) || "vaanix_webhook_secret";
    const signature = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vaanix-Signature": signature,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Webhook responded with status ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      message: data.message || "External system check completed successfully.",
      data,
    };
  } catch (err: any) {
    console.warn("[Action:CallWebhook] Execution notice:", err.message);
    return {
      ok: false,
      error: err.message,
      message: "I am having trouble receiving information from our external records right now.",
      spokenFallback: "Our system is taking longer than expected to look that up.",
    };
  }
}
