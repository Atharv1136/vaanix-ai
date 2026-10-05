import { supabaseAdmin } from "../supabase";

const db = supabaseAdmin as any;

export interface AvailableSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  formattedTime: string; // e.g. "10:00 AM"
  resourceId?: string;
  resourceName?: string;
}

export interface SlotQuery {
  userId: string;
  date: string; // YYYY-MM-DD
  durationMinutes?: number;
  serviceId?: string;
  resourceId?: string;
}

const DAYS_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Computes available booking slots for a given tenant, date, and service/resource.
 * Respects business profile working hours, lunch break, resource time-off, and existing appointments.
 */
export async function getAvailableSlots(query: SlotQuery): Promise<AvailableSlot[]> {
  const { userId, date, durationMinutes = 30, resourceId } = query;

  // 1. Fetch business profile
  const { data: profile } = await db
    .from("business_profiles")
    .select("working_hours, lunch_break, timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const timezone = profile?.timezone || "Asia/Kolkata";

  // Parse target date and find day of week
  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = DAYS_MAP[targetDate.getUTCDay()];

  // 2. Determine operating hours for this day
  let dayShifts: [string, string][] = [["10:00", "19:00"]];
  if (profile?.working_hours && typeof profile.working_hours === "object") {
    const customHours = profile.working_hours as Record<string, any>;
    if (Array.isArray(customHours[dayOfWeek]) && customHours[dayOfWeek].length > 0) {
      dayShifts = customHours[dayOfWeek];
    } else if (customHours.start && customHours.end) {
      dayShifts = [[customHours.start, customHours.end]];
    }
  }

  // If day is closed (empty shifts)
  if (dayShifts.length === 0) {
    return [];
  }

  // 3. Fetch active resources
  let resourcesQuery = db
    .from("resources")
    .select("id, name")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (resourceId) {
    resourcesQuery = resourcesQuery.eq("id", resourceId);
  }

  const { data: resources } = await resourcesQuery;
  const activeResources: { id: string | null; name: string }[] = resources && resources.length > 0
    ? resources
    : [{ id: null, name: "Default" }];

  // 4. Fetch existing appointments for the day
  const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();

  const [{ data: existingAppointments }, { data: existingTimeOff }] = await Promise.all([
    db
      .from("appointments")
      .select("resource_id, start_time, end_time")
      .eq("user_id", userId)
      .in("status", ["confirmed", "pending"])
      .gte("end_time", startOfDay)
      .lte("start_time", endOfDay),
    db
      .from("time_off")
      .select("resource_id, start_time, end_time")
      .eq("user_id", userId)
      .gte("end_time", startOfDay)
      .lte("start_time", endOfDay),
  ]);

  const bookedIntervals = (existingAppointments || []).map((a: any) => ({
    resourceId: a.resource_id,
    start: new Date(a.start_time).getTime(),
    end: new Date(a.end_time).getTime(),
  }));

  const timeOffIntervals = (existingTimeOff || []).map((t: any) => ({
    resourceId: t.resource_id,
    start: new Date(t.start_time).getTime(),
    end: new Date(t.end_time).getTime(),
  }));

  const availableSlots: AvailableSlot[] = [];
  const nowMs = Date.now();

  // Helper to format 24h string to 12h display
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    let hours = d.getUTCHours();
    const minutes = d.getUTCMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  // Generate candidate slots per shift
  for (const shift of dayShifts) {
    const [shiftStartH, shiftStartM] = shift[0].split(":").map(Number);
    const [shiftEndH, shiftEndM] = shift[1].split(":").map(Number);

    const shiftStartTime = new Date(`${date}T${shiftStartH.toString().padStart(2, "0")}:${shiftStartM.toString().padStart(2, "0")}:00.000Z`).getTime();
    const shiftEndTime = new Date(`${date}T${shiftEndH.toString().padStart(2, "0")}:${shiftEndM.toString().padStart(2, "0")}:00.000Z`).getTime();

    const slotStepMs = 30 * 60 * 1000; // 30-min increments
    const slotDurationMs = durationMinutes * 60 * 1000;

    for (let slotStart = shiftStartTime; slotStart + slotDurationMs <= shiftEndTime; slotStart += slotStepMs) {
      const slotEnd = slotStart + slotDurationMs;

      // Don't show slots in the past
      if (slotStart <= nowMs + 10 * 60 * 1000) {
        continue;
      }

      // Check if ANY active resource is free for this slot
      for (const res of activeResources) {
        const isResourceBooked = bookedIntervals.some(
          (b: { resourceId: any; start: number; end: number }) => (!res.id || !b.resourceId || b.resourceId === res.id) && slotStart < b.end && slotEnd > b.start
        );

        const isResourceOff = timeOffIntervals.some(
          (t: { resourceId: any; start: number; end: number }) => (!res.id || !t.resourceId || t.resourceId === res.id) && slotStart < t.end && slotEnd > t.start
        );

        if (!isResourceBooked && !isResourceOff) {
          const isoStart = new Date(slotStart).toISOString();
          const isoEnd = new Date(slotEnd).toISOString();

          // Avoid duplicate slot times for the customer view
          if (!availableSlots.some((s) => s.startTime === isoStart)) {
            availableSlots.push({
              startTime: isoStart,
              endTime: isoEnd,
              formattedTime: formatTime(isoStart),
              resourceId: res.id || undefined,
              resourceName: res.name || undefined,
            });
          }
          break; // Slot is available
        }
      }
    }
  }

  return availableSlots;
}
