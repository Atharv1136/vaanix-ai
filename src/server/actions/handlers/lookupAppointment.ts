import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleLookupAppointment(
  input: { phone?: string },
  ctx: ActionContext
): Promise<ActionResult> {
  const phone = input.phone || ctx.callerNumber;
  if (!phone) {
    return {
      ok: false,
      error: "missing_phone",
      message: "Could you please confirm your phone number so I can check your appointment?",
    };
  }

  try {
    const { data: appts } = await db
      .from("appointments")
      .select("id, start_time, end_time, status, customer_name, services(name)")
      .eq("user_id", ctx.userId)
      .eq("customer_phone", phone)
      .eq("status", "confirmed")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(3);

    if (!appts || appts.length === 0) {
      return {
        ok: true,
        message: "You currently do not have any upcoming appointments scheduled with us. Would you like to book one?",
        data: { appointments: [] },
      };
    }

    const first = appts[0];
    const d = new Date(first.start_time);
    const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    return {
      ok: true,
      message: `You have an appointment confirmed for ${dateStr} at ${timeStr}.`,
      data: {
        appointments: appts.map((a: any) => ({
          id: a.id,
          date: a.start_time,
          service: a.services?.name || "Standard",
          status: a.status,
        })),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I am having trouble looking up your booking. Please hold on.",
    };
  }
}
