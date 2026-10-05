import { ActionContext, ActionResult } from "../types";
import { getAvailableSlots } from "../../scheduling/slots";

export async function handleCheckAvailability(
  input: { date?: string; service?: string; resource?: string; duration_minutes?: number },
  ctx: ActionContext
): Promise<ActionResult> {
  try {
    const targetDate = input.date || new Date().toISOString().split("T")[0];
    const slots = await getAvailableSlots({
      userId: ctx.userId,
      date: targetDate,
      serviceId: input.service,
      resourceId: input.resource,
      durationMinutes: input.duration_minutes || 30,
    });

    if (!slots || slots.length === 0) {
      return {
        ok: true,
        message: `There are no open slots available on ${targetDate}. Would you like to check the following day?`,
        data: { date: targetDate, slots: [] },
      };
    }

    const preview = slots.slice(0, 3).map((s) => s.formattedTime).join(", ");
    return {
      ok: true,
      message: `On ${targetDate}, open slots include ${preview}. Which time suits you best?`,
      data: {
        date: targetDate,
        slots: slots.slice(0, 4).map((s) => s.formattedTime),
        rawSlots: slots.slice(0, 4),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "I am having difficulty checking our calendar right now. Please allow me a moment.",
      spokenFallback: "I apologize, our calendar is temporarily slow to respond.",
    };
  }
}
