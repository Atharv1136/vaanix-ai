import { supabaseAdmin } from "../supabase";
const db: any = supabaseAdmin;
import { getAvailableSlots } from "./slots";

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Action: check_availability
 */
export async function executeCheckAvailability(
  params: { date?: string; service_id?: string; resource_id?: string; duration_minutes?: number },
  userId: string,
  callId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  try {
    const targetDate = params.date || new Date().toISOString().split("T")[0];
    const slots = await getAvailableSlots({
      userId,
      date: targetDate,
      serviceId: params.service_id,
      resourceId: params.resource_id,
      durationMinutes: params.duration_minutes || 30,
    });

    let spokenMessage = "";
    if (slots.length === 0) {
      spokenMessage = `I checked our schedule for ${targetDate}, but there are no open slots available on that day. Would you like to check the following day?`;
    } else {
      const topTimes = slots.slice(0, 4).map((s) => s.formattedTime).join(", ");
      spokenMessage = `We have open slots on ${targetDate} at ${topTimes}. Which time works best for you?`;
    }

    // Log action run
    await db.from("action_runs").insert({
      user_id: userId,
      call_id: callId || null,
      action_name: "check_availability",
      input_payload: params,
      output_payload: { count: slots.length, slots: slots.slice(0, 8) },
      status: "success",
      latency_ms: Date.now() - startTime,
    });

    return {
      success: true,
      message: spokenMessage,
      data: { slots },
    };
  } catch (err: any) {
    console.error("[ActionEngine] check_availability error:", err);
    return {
      success: false,
      message: "I am having trouble checking the appointment calendar right now.",
    };
  }
}

/**
 * Action: book_appointment
 */
export async function executeBookAppointment(
  params: {
    customer_name: string;
    customer_phone: string;
    start_time: string; // ISO string
    duration_minutes?: number;
    service_id?: string;
    resource_id?: string;
    notes?: string;
  },
  userId: string,
  callId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  const duration = params.duration_minutes || 30;
  const startDt = new Date(params.start_time);
  const endDt = new Date(startDt.getTime() + duration * 60 * 1000);

  try {
    // If resource is not specified, assign the first available resource
    let assignedResourceId = params.resource_id;
    if (!assignedResourceId) {
      const { data: resList } = await db
        .from("resources")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1);
      if (resList && resList.length > 0) {
        assignedResourceId = resList[0].id;
      }
    }

    // Insert into appointments (protected by PostgreSQL GiST exclusion constraint)
    const { data: appointment, error: insertErr } = await db
      .from("appointments")
      .insert({
        user_id: userId,
        customer_name: params.customer_name,
        customer_phone: params.customer_phone,
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        status: "confirmed",
        service_id: params.service_id || null,
        resource_id: assignedResourceId || null,
        notes: params.notes || null,
        call_id: callId || null,
      })
      .select("id, start_time, customer_name")
      .single();

    if (insertErr) {
      // Check for GiST exclusion constraint violation (code 23P01)
      if (insertErr.code === "23P01" || insertErr.message?.includes("no_double_booking")) {
        return {
          success: false,
          message: "I'm sorry, that specific time was just booked by someone else. Let me check the next available opening for you.",
        };
      }
      throw insertErr;
    }

    // Queue confirmation SMS in messages table
    const timeString = startDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const dateString = startDt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const confirmationText = `Hi ${params.customer_name}, your appointment is confirmed for ${dateString} at ${timeString}. Reply CANCEL if you need to reschedule.`;

    await db.from("messages").insert({
      user_id: userId,
      recipient_phone: params.customer_phone,
      content: confirmationText,
      channel: "sms",
      direction: "outbound",
      status: "sent",
      call_id: callId || null,
      appointment_id: appointment.id,
    });

    // Log action run
    await db.from("action_runs").insert({
      user_id: userId,
      call_id: callId || null,
      action_name: "book_appointment",
      input_payload: params,
      output_payload: { appointmentId: appointment.id },
      status: "success",
      latency_ms: Date.now() - startTime,
    });

    const spokenMessage = `Your appointment has been successfully booked for ${dateString} at ${timeString}. A confirmation message has been sent to your phone.`;

    return {
      success: true,
      message: spokenMessage,
      data: { appointment },
    };
  } catch (err: any) {
    console.error("[ActionEngine] book_appointment error:", err);
    await db.from("action_runs").insert({
      user_id: userId,
      call_id: callId || null,
      action_name: "book_appointment",
      input_payload: params,
      output_payload: { error: err.message },
      status: "failed",
      error_message: err.message,
      latency_ms: Date.now() - startTime,
    });

    return {
      success: false,
      message: "I could not finalize the booking due to a system issue. Let me connect you with our front desk staff.",
    };
  }
}

/**
 * Action: reschedule_appointment
 */
export async function executeRescheduleAppointment(
  params: { appointment_id: string; new_start_time: string; duration_minutes?: number },
  userId: string,
  callId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  const duration = params.duration_minutes || 30;
  const startDt = new Date(params.new_start_time);
  const endDt = new Date(startDt.getTime() + duration * 60 * 1000);

  try {
    const { data: updated, error } = await db
      .from("appointments")
      .update({
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.appointment_id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23P01" || error.message?.includes("no_double_booking")) {
        return {
          success: false,
          message: "That new time slot is unfortunately already occupied. Would you like another time?",
        };
      }
      throw error;
    }

    const timeString = startDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const dateString = startDt.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    await db.from("action_runs").insert({
      user_id: userId,
      call_id: callId || null,
      action_name: "reschedule_appointment",
      input_payload: params,
      output_payload: { appointmentId: params.appointment_id },
      status: "success",
      latency_ms: Date.now() - startTime,
    });

    return {
      success: true,
      message: `I have rescheduled your appointment to ${dateString} at ${timeString}.`,
      data: { updated },
    };
  } catch (err: any) {
    console.error("[ActionEngine] reschedule error:", err);
    return {
      success: false,
      message: "I could not reschedule your appointment at this time.",
    };
  }
}

/**
 * Action: cancel_appointment
 */
export async function executeCancelAppointment(
  params: { appointment_id: string; reason?: string },
  userId: string,
  callId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  try {
    const { error } = await db
      .from("appointments")
      .update({
        status: "cancelled",
        notes: params.reason ? `Cancelled: ${params.reason}` : "Cancelled via AI voice assistant",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.appointment_id)
      .eq("user_id", userId);

    if (error) throw error;

    await db.from("action_runs").insert({
      user_id: userId,
      call_id: callId || null,
      action_name: "cancel_appointment",
      input_payload: params,
      output_payload: { appointmentId: params.appointment_id },
      status: "success",
      latency_ms: Date.now() - startTime,
    });

    return {
      success: true,
      message: "Your appointment has been cancelled. Please let us know if you would like to book a new time in the future.",
    };
  } catch (err: any) {
    console.error("[ActionEngine] cancel error:", err);
    return {
      success: false,
      message: "I could not cancel the appointment. Our team will verify and follow up with you.",
    };
  }
}

/**
 * Action: lookup_faq
 */
export async function executeLookupFaq(
  params: { query: string; assistant_id?: string },
  userId: string
): Promise<ActionResult> {
  try {
    let qaQuery = db
      .from("assistant_qas")
      .select("question, answer, assistant_id, assistants(user_id)")
      .ilike("question", `%${params.query}%`);

    if (params.assistant_id) {
      qaQuery = qaQuery.eq("assistant_id", params.assistant_id);
    }

    const { data: qas } = await qaQuery.limit(3);

    if (qas && qas.length > 0) {
      return {
        success: true,
        message: qas[0].answer,
        data: { matches: qas },
      };
    }

    return {
      success: false,
      message: "I don't have that specific information in my directory, but I can ask our team to assist you.",
    };
  } catch (err: any) {
    return {
      success: false,
      message: "Let me check with our staff regarding your question.",
    };
  }
}
