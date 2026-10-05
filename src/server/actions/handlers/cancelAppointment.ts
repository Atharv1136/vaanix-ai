import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleCancelAppointment(
  input: { appointment_id?: string; phone?: string; reason?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  const phone = input.phone || ctx.callerNumber;
  try {
    let appointmentId = input.appointment_id;

    if (!appointmentId && phone) {
      const { data: latest } = await db
        .from("appointments")
        .select("id, start_time")
        .eq("user_id", ctx.userId)
        .eq("customer_phone", phone)
        .eq("status", "confirmed")
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) appointmentId = latest.id;
    }

    if (!appointmentId) {
      return {
        ok: false,
        error: "appointment_not_found",
        message: "I could not find an upcoming appointment under that phone number.",
        spokenFallback: "I don't see an upcoming appointment to cancel.",
      };
    }

    await db
      .from("appointments")
      .update({
        status: "cancelled",
        notes: input.reason ? `Cancelled: ${input.reason}` : "Cancelled by caller",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("user_id", ctx.userId);

    return {
      ok: true,
      message: "Your appointment has been cancelled. Please let us know whenever you wish to book again.",
      data: { appointment_id: appointmentId, status: "cancelled" },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I was unable to cancel the appointment right now. Please allow me to notify our staff.",
    };
  }
}
