import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleCaptureLead(
  input: {
    name?: string;
    phone?: string;
    email?: string;
    interest?: string;
    notes?: string;
    fields?: Record<string, any>;
  },
  ctx: ActionContext
): Promise<ActionResult> {
  const phone = input.phone || ctx.callerNumber;
  if (!phone) {
    return {
      ok: false,
      error: "missing_phone",
      message: "May I please have your phone number so our team can follow up with you?",
      spokenFallback: "What is the best phone number to reach you?",
    };
  }

  try {
    const fields = {
      ...(input.fields || {}),
      interest: input.interest,
      notes: input.notes,
      captured_at: new Date().toISOString(),
    };

    const { data: contact, error } = await db.from("contacts").upsert(
      {
        user_id: ctx.userId,
        name: input.name || null,
        phone: phone.trim(),
        email: input.email || null,
        fields,
        source: ctx.agentId ? `agent_${ctx.agentId}` : "voice_call",
      },
      { onConflict: "user_id,phone" }
    ).select("id").single();

    if (error) throw error;

    return {
      ok: true,
      message: "Thank you, I have recorded your details and our team will get in touch with you shortly.",
      data: { contact_id: contact?.id },
    };
  } catch (err: any) {
    console.error("[Action:CaptureLead] Error:", err);
    return {
      ok: false,
      error: err.message,
      message: "Thank you, I have noted that down for our team.",
    };
  }
}
