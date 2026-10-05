import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleBookAppointment(
  input: {
    name: string;
    phone?: string;
    start_time: string;
    service?: string;
    resource?: string;
    reason?: string;
  },
  ctx: ActionContext
): Promise<ActionResult> {
  const { name, start_time } = input;
  const phone = input.phone || ctx.callerNumber;

  if (!name || !start_time) {
    return {
      ok: false,
      error: "missing_fields",
      message: "Please state your full name and preferred booking slot.",
      spokenFallback: "I need your full name and confirmed slot time to book.",
    };
  }

  if (!phone) {
    return {
      ok: false,
      error: "missing_phone",
      message: "Could you please confirm your contact telephone number for the confirmation?",
      spokenFallback: "Please tell me the best contact number for the booking.",
    };
  }

  try {
    const startDate = new Date(start_time);
    if (isNaN(startDate.getTime())) {
      return {
        ok: false,
        error: "invalid_time_format",
        message: "I could not understand that slot time. Please say a valid time like 'tomorrow at 3 PM'.",
      };
    }

    const durationMin = 30;
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

    // 1. Upsert contact
    await db.from("contacts").upsert(
      {
        user_id: ctx.userId,
        name: name.trim(),
        phone: phone.trim(),
        source: ctx.agentId ? `agent_${ctx.agentId}` : "voice_call",
      },
      { onConflict: "user_id,phone" }
    );

    const isUUID = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // 2. Select default resource if not provided or not a valid UUID
    let resourceId = isUUID(input.resource) ? input.resource : null;
    if (!resourceId) {
      const { data: firstRes } = await db
        .from("resources")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (firstRes) resourceId = firstRes.id;
    }

    // 3. Select default service if not provided or resolve by name
    let serviceId = isUUID(input.service) ? input.service : null;
    const serviceName = input.service || "";
    if (!serviceId) {
      if (serviceName) {
        const { data: matchedServ } = await db
          .from("services")
          .select("id")
          .eq("user_id", ctx.userId)
          .ilike("name", `%${serviceName}%`)
          .limit(1)
          .maybeSingle();
        if (matchedServ) serviceId = matchedServ.id;
      }
      if (!serviceId) {
        const { data: firstServ } = await db
          .from("services")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (firstServ) serviceId = firstServ.id;
      }
    }

    const noteText = input.reason
      ? `${input.reason}${serviceName ? ` (Service: ${serviceName})` : ""}`
      : (serviceName ? `Service: ${serviceName}` : "Booked via Vaanix Voice Agent");

    // 4. Attempt to insert appointment (PostgreSQL GiST constraint protects against double bookings)
    const { data: appt, error: apptErr } = await db
      .from("appointments")
      .insert({
        user_id: ctx.userId,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        resource_id: resourceId || null,
        service_id: serviceId || null,
        status: "confirmed",
        notes: noteText,
        call_id: ctx.callId || null,
      })
      .select("id")
      .single();

    if (apptErr) {
      // GiST exclusion constraint violation: 23P01
      if (apptErr.code === "23P01" || apptErr.message?.includes("no_double_booking")) {
        return {
          ok: false,
          error: "slot_taken",
          message: "I apologize, but that exact slot was just taken. Let me offer you another open time.",
          spokenFallback: "That time has just been reserved. Could we try another slot?",
        };
      }
      throw apptErr;
    }

    const readableDate = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const readableTime = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // 5. Queue confirmation SMS
    await db.from("messages").insert({
      user_id: ctx.userId,
      recipient_phone: phone.trim(),
      content: `Your appointment is confirmed for ${readableDate} at ${readableTime}. Thank you for booking with us!`,
      channel: "sms",
      call_id: ctx.callId || null,
      appointment_id: appt.id,
      status: "queued",
    });

    return {
      ok: true,
      message: `Your appointment has been confirmed for ${readableDate} at ${readableTime}. We have sent a confirmation SMS to your number.`,
      data: {
        appointment_id: appt.id,
        display: `${readableDate} at ${readableTime}`,
      },
    };
  } catch (err: any) {
    console.error("[Action:BookAppointment] Error:", err);
    return {
      ok: false,
      error: err.message,
      message: "I encountered an error reserving that slot. Would you like me to try again?",
      spokenFallback: "I had trouble completing the booking. Let me try once more.",
    };
  }
}
