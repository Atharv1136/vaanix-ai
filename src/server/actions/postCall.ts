import { supabaseAdmin } from "../supabase";
import { completionWithFallback } from "../services/aiKeyPool";
import { getDynamicTwilioClient } from "../twilioClient";
const db: any = supabaseAdmin;

export async function finalizeCall(callId: string, userId: string): Promise<void> {
  console.log(`[PostCall] Finalizing call ${callId} for user ${userId}`);

  try {
    // 1. Fetch transcripts
    const { data: transcripts } = await db
      .from("call_transcripts")
      .select("speaker, text, timestamp")
      .eq("call_id", callId)
      .order("timestamp", { ascending: true });

    const transcriptText = (transcripts || [])
      .map((t: any) => `${t.speaker.toUpperCase()}: ${t.text}`)
      .join("\n");

    let summary = "Call completed with AI assistant.";
    let outcome = "info_only";
    let sentiment = "neutral";

    // 2. Check if an appointment was booked in this call
    const { data: bookedAppt } = await db
      .from("appointments")
      .select("id, start_time, customer_phone")
      .eq("call_id", callId)
      .eq("status", "confirmed")
      .maybeSingle();

    if (bookedAppt) {
      outcome = "booked";
      // Schedule reminder job 24h before appointment
      const apptDate = new Date(bookedAppt.start_time);
      const reminderTime = new Date(apptDate.getTime() - 24 * 60 * 60 * 1000);

      if (reminderTime > new Date()) {
        await db.from("scheduled_jobs").insert({
          user_id: userId,
          job_type: "reminder_sms",
          run_at: reminderTime.toISOString(),
          payload: {
            appointment_id: bookedAppt.id,
            recipient_phone: bookedAppt.customer_phone,
            start_time: bookedAppt.start_time,
          },
          status: "pending",
        });
      }
    }

    // 3. Check if lead was captured
    if (!bookedAppt) {
      const { data: actionRuns } = await db
        .from("action_runs")
        .select("action_name, status")
        .eq("call_id", callId);

      const actions = (actionRuns || []).map((a: any) => a.action_name);
      if (actions.includes("transfer_to_human")) {
        outcome = "transferred";
      } else if (actions.includes("cancel_appointment")) {
        outcome = "cancelled";
      } else if (actions.includes("reschedule_appointment")) {
        outcome = "rescheduled";
      } else if (actions.includes("capture_lead")) {
        outcome = "lead";
      }
    }

    // 4. Generate AI summary if transcripts exist
    if (transcriptText.trim().length > 20) {
      try {
        const prompt = [
          {
            role: "user",
            content: `Analyze this call transcript and return a JSON object with keys:
"summary": a brief 1-2 sentence overview of what the caller wanted and what happened.
"sentiment": "positive", "neutral", or "negative".

Transcript:
${transcriptText}`,
          },
        ];

        const res = await completionWithFallback(prompt, undefined, userId);
        const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
        if (parsed.summary) summary = parsed.summary;
        if (parsed.sentiment) sentiment = parsed.sentiment;
      } catch (aiErr: any) {
        console.warn("[PostCall] LLM summary notice:", aiErr.message);
      }
    }

    // 5. Update call record
    await db
      .from("calls")
      .update({
        summary,
        outcome,
        sentiment,
        ended_at: new Date().toISOString(),
      })
      .eq("id", callId);

    console.log(`[PostCall] Call ${callId} updated with outcome: ${outcome}`);
  } catch (err: any) {
    console.error(`[PostCall] Error finalizing call ${callId}:`, err);
  }
}

/**
 * Background worker checking for due scheduled_jobs every 60s
 */
let workerInterval: NodeJS.Timeout | null = null;

export function startScheduledJobsWorker(): void {
  if (workerInterval) return;

  console.log("[Worker] Starting Scheduled Jobs background reminder worker");
  workerInterval = setInterval(async () => {
    try {
      const nowIso = new Date().toISOString();
      const { data: dueJobs } = await db
        .from("scheduled_jobs")
        .select("*")
        .eq("status", "pending")
        .lte("run_at", nowIso)
        .limit(10);

      if (!dueJobs || dueJobs.length === 0) return;

      for (const job of dueJobs) {
        if (job.job_type === "reminder_sms") {
          const payload = job.payload || {};
          const recipient = payload.recipient_phone;
          const startTime = payload.start_time;

          if (recipient && startTime) {
            const dateStr = new Date(startTime).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            const content = `Friendly reminder: Your upcoming appointment is scheduled for ${dateStr}. Please reply or call us if you need to reschedule!`;

            try {
              const { client } = await getDynamicTwilioClient(job.user_id);
              if (client) {
                const { data: line } = await db
                  .from("phone_numbers")
                  .select("phone_number")
                  .eq("user_id", job.user_id)
                  .limit(1)
                  .maybeSingle();

                const fromNumber = line?.phone_number || process.env.TWILIO_PHONE_NUMBER;
                if (fromNumber) {
                  await client.messages.create({
                    body: content,
                    from: fromNumber,
                    to: recipient,
                  });
                }
              }

              await db.from("messages").insert({
                user_id: job.user_id,
                recipient_phone: recipient,
                content,
                channel: "sms",
                appointment_id: payload.appointment_id || null,
                status: "sent",
              });
            } catch (smsErr: any) {
              console.warn("[Worker] Reminder SMS error:", smsErr.message);
            }
          }
        }

        await db
          .from("scheduled_jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }
    } catch (err: any) {
      console.warn("[Worker] Scheduled jobs iteration notice:", err.message);
    }
  }, 60000);
}
