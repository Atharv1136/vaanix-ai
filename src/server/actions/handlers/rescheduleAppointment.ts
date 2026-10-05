import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleRescheduleAppointment(
  input: { appointment_id?: string; new_start_time: string; phone?: string; duration_minutes?: number },
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
        message: "I could not find an active appointment under your phone number to reschedule.",
        spokenFallback: "I cannot locate an upcoming appointment to reschedule.",
      };
    }

    const newStart = new Date(input.new_start_time);
    const duration = (input.duration_minutes || 30) * 60 * 1000;
    const newEnd = new Date(newStart.getTime() + duration);

    const { error: updErr } = await db
      .from("appointments")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("user_id", ctx.userId);

    if (updErr) {
      if (updErr.code === "23P01" || updErr.message?.includes("no_double_booking")) {
        return {
          ok: false,
          error: "slot_taken",
          message: "The new slot requested is already booked by another caller. Please choose another time.",
        };
      }
      throw updErr;
    }

    const readableDate = newStart.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const readableTime = newStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    return {
      ok: true,
      message: `Your appointment has been successfully rescheduled to ${readableDate} at ${readableTime}.`,
      data: { appointment_id: appointmentId, new_display: `${readableDate} at ${readableTime}` },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I could not reschedule your booking at this moment. Let me check the schedule again.",
    };
  }
}
