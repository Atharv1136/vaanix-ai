import { Request, Response } from "express";
import { supabaseAdmin as db } from "../supabase";
import { getPublicBaseUrl } from "./outbound";
import { getDynamicTwilioClient } from "../twilioClient";

export function normalizePhoneNumber(raw: string): string {
  let str = (raw || "").trim();
  if (!str) return "";

  if (/^[+\-]?\d+(\.\d+)?[eE][+\-]?\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = Math.round(num).toString();
    }
  }

  const hasPlus = str.startsWith("+");
  const digitsOnly = str.replace(/\D/g, "");

  if (!digitsOnly) return str;

  if (digitsOnly.length === 10) {
    return "+91" + digitsOnly;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return "+" + digitsOnly;
  }
  if (hasPlus) {
    return "+" + digitsOnly;
  }
  return "+" + digitsOnly;
}

// Map to store active watchdog timers per contact
const contactWatchdogs = new Map<string, NodeJS.Timeout>();
// Map to store active direct Twilio status pollers per contact
const activeCallPollers = new Map<string, NodeJS.Timeout>();

function clearContactWatchdog(contactId: string) {
  if (contactWatchdogs.has(contactId)) {
    clearTimeout(contactWatchdogs.get(contactId)!);
    contactWatchdogs.delete(contactId);
  }
}

function clearCallPoller(contactId: string) {
  if (activeCallPollers.has(contactId)) {
    clearInterval(activeCallPollers.get(contactId)!);
    activeCallPollers.delete(contactId);
  }
}

function setContactWatchdog(campaignId: string, contactId: string, timeoutMs = 60000) {
  clearContactWatchdog(contactId);

  const timer = setTimeout(async () => {
    contactWatchdogs.delete(contactId);
    clearCallPoller(contactId);
    console.warn(`[BulkCampaign] Watchdog fired for contact ${contactId}. Auto-advancing campaign.`);

    try {
      const { data: contact } = await db
        .from("bulk_call_contacts")
        .select("status")
        .eq("id", contactId)
        .maybeSingle();

      if (contact && (contact.status === "calling" || contact.status === "pending")) {
        await db
          .from("bulk_call_contacts")
          .update({
            status: "no_answer",
            status_reason: "Call timed out with no carrier response.",
          })
          .eq("id", contactId);

        console.log(`[BulkCampaign] Watchdog: marked contact ${contactId} as no_answer, triggering next call...`);
        dialNextContact(campaignId);
      }
    } catch (err: any) {
      console.error(`[BulkCampaign] Watchdog error:`, err.message);
    }
  }, timeoutMs);

  contactWatchdogs.set(contactId, timer);
}

/**
 * Actively polls Twilio's REST API every 2.5s for true carrier call status.
 * This guarantees that even if the carrier webhook/tunnel drops or user cuts call,
 * the campaign immediately notices call ended and dials next contact without getting stuck!
 */
function trackTwilioCallUntilCompletion(
  twilioClient: any,
  callSid: string,
  campaignId: string,
  contactId: string,
  callRecordId: string,
) {
  if (!callSid || !twilioClient) return;

  clearCallPoller(contactId);

  let pollCount = 0;
  const maxPolls = 80; // poll for up to 3.3 minutes

  const interval = setInterval(async () => {
    pollCount++;
    try {
      // Check if campaign was paused
      const { data: currentCamp } = await db
        .from("bulk_call_campaigns")
        .select("status")
        .eq("id", campaignId)
        .maybeSingle();

      if (currentCamp?.status === "paused") {
        clearCallPoller(contactId);
        clearContactWatchdog(contactId);
        return;
      }

      const call = await twilioClient.calls(callSid).fetch();
      const status = call.status; // 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed' | 'canceled'

      if (status === "in-progress") {
        await db
          .from("bulk_call_contacts")
          .update({ status: "answered" })
          .eq("id", contactId);
      } else if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        clearCallPoller(contactId);
        clearContactWatchdog(contactId);

        const isAnswered = status === "completed";
        const contactStatus = isAnswered ? "answered" : "no_answer";

        await db
          .from("bulk_call_contacts")
          .update({
            status: contactStatus,
            status_reason: status !== "completed" ? `Call ended with carrier status: ${status}` : null,
          })
          .eq("id", contactId);

        if (callRecordId) {
          await db
            .from("calls")
            .update({
              outcome: isAnswered ? "resolved" : "no_answer",
              ended_at: new Date().toISOString(),
              duration_seconds: parseInt(call.duration || "0", 10) || 0,
            })
            .eq("id", callRecordId);
        }

        if (isAnswered) {
          try {
            await db.rpc("increment_campaign_answered", { campaign_id_arg: campaignId });
          } catch {
            const { data: camp } = await db
              .from("bulk_call_campaigns")
              .select("answered_count")
              .eq("id", campaignId)
              .maybeSingle();
            if (camp) {
              await db
                .from("bulk_call_campaigns")
                .update({ answered_count: (camp.answered_count || 0) + 1 })
                .eq("id", campaignId);
            }
          }
        }

        console.log(`[BulkCampaign:Poller] Contact ${contactId} CallSid ${callSid.slice(0, 8)} ended (${status}). Advancing campaign ${campaignId}...`);
        setTimeout(() => dialNextContact(campaignId), 1500);
      } else if (pollCount >= maxPolls) {
        clearCallPoller(contactId);
      }
    } catch (err: any) {
      console.warn(`[BulkCampaign:Poller] Poller notice for ${callSid}:`, err.message);
      if (pollCount >= maxPolls) {
        clearCallPoller(contactId);
      }
    }
  }, 2500);

  activeCallPollers.set(contactId, interval);
}

/**
 * Sequential dialing core.
 * Dials the next pending contact for a campaign.
 */
async function dialNextContact(campaignId: string): Promise<void> {
  const { client: twilioClient, credentials } = await getDynamicTwilioClient();
  const publicBaseUrl = getPublicBaseUrl();

  if (!twilioClient || !publicBaseUrl) {
    console.error(`[BulkCampaign] Twilio client or public base URL not available for campaign ${campaignId}`);
    await db
      .from("bulk_call_campaigns")
      .update({ status: "failed" })
      .eq("id", campaignId);
    return;
  }

  // Fetch campaign details
  const { data: campaign } = await db
    .from("bulk_call_campaigns")
    .select("*, phone_numbers(phone_number)")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign || campaign.status === "paused" || campaign.status === "completed" || campaign.status === "failed") {
    return;
  }

  // Check if any contact is currently calling; if so, verify if it was orphaned
  const { data: activeCalling } = await db
    .from("bulk_call_contacts")
    .select("id, attempted_at")
    .eq("campaign_id", campaignId)
    .eq("status", "calling")
    .limit(1);

  if (activeCalling && activeCalling.length > 0) {
    const callingContact = activeCalling[0];
    const attemptedTime = callingContact.attempted_at ? new Date(callingContact.attempted_at).getTime() : 0;
    const isOrphaned = Date.now() - attemptedTime > 90000; // >90s stuck

    if (!isOrphaned) {
      // Current contact is still actively calling, wait for it
      return;
    } else {
      // Mark orphaned contact as no_answer
      await db
        .from("bulk_call_contacts")
        .update({ status: "no_answer", status_reason: "Call session timed out" })
        .eq("id", callingContact.id);
    }
  }

  // Get next pending contact
  const { data: contact } = await db
    .from("bulk_call_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("position")
    .limit(1)
    .maybeSingle();

  if (!contact) {
    // No more contacts pending or calling — campaign complete
    await db
      .from("bulk_call_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId);
    console.log(`[BulkCampaign] Campaign ${campaignId} completed.`);
    return;
  }

  // Mark contact as calling
  await db
    .from("bulk_call_contacts")
    .update({ status: "calling", attempted_at: new Date().toISOString() })
    .eq("id", contact.id);

  // Arm watchdog for this contact (60 seconds)
  setContactWatchdog(campaignId, contact.id, 60000);

  const fromNumber = (campaign.phone_numbers as any)?.phone_number || credentials.phoneNumber || process.env.TWILIO_PHONE_NUMBER || "";
  const cleanNumber = normalizePhoneNumber(contact.phone_number);

  // Create call record
  const { data: callRecord } = await db
    .from("calls")
    .insert({
      student_or_caller_number: cleanNumber,
      direction: "outbound",
      outcome: "in_progress",
      started_at: new Date().toISOString(),
      assistant_id: campaign.assistant_id || null,
      phone_number_id: campaign.phone_number_id || null,
    })
    .select("id")
    .single();

  // Link call to contact
  if (callRecord) {
    await db
      .from("bulk_call_contacts")
      .update({ call_id: callRecord.id })
      .eq("id", contact.id);
  }

  try {
    const assistantId = campaign.assistant_id || "";
    const callId = callRecord?.id || "";

    // Context note embeds campaign and contact info for the AI
    const contextNote = encodeURIComponent(`Bulk campaign call. Caller name: ${contact.name}`);

    const twilioCall = await twilioClient.calls.create({
      to: cleanNumber,
      from: fromNumber,
      url: `${publicBaseUrl}/webhooks/twilio/voice?assistant_id=${encodeURIComponent(assistantId)}&call_record_id=${encodeURIComponent(callId)}&caller_name=${encodeURIComponent(contact.name)}&context_note=${contextNote}&campaign_id=${encodeURIComponent(campaignId)}&contact_id=${encodeURIComponent(contact.id)}`,
      statusCallback: `${publicBaseUrl}/api/outbound/bulk/call-status?campaign_id=${encodeURIComponent(campaignId)}&contact_id=${encodeURIComponent(contact.id)}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed", "busy", "no-answer", "failed", "canceled"],
    });

    // Start active polling watchdog to monitor carrier status changes in real-time
    if (twilioCall && twilioCall.sid) {
      trackTwilioCallUntilCompletion(twilioClient, twilioCall.sid, campaignId, contact.id, callId);
    }

    // Increment called_count safely
    try {
      await db.rpc("increment_campaign_called", { campaign_id_arg: campaignId });
    } catch {
      const { data: camp } = await db
        .from("bulk_call_campaigns")
        .select("called_count")
        .eq("id", campaignId)
        .maybeSingle();
      if (camp) {
        await db
          .from("bulk_call_campaigns")
          .update({ called_count: (camp.called_count || 0) + 1 })
          .eq("id", campaignId);
      }
    }

    console.log(`[BulkCampaign] Dialing ${cleanNumber} (contact ${contact.position}/${campaign.total_contacts}) CallSid: ${twilioCall.sid}`);
  } catch (err: any) {
    clearContactWatchdog(contact.id);
    clearCallPoller(contact.id);
    console.error(`[BulkCampaign] Failed to dial ${cleanNumber}:`, err.message);

    // Save exact failure reason to contact record so user sees why provider rejected the call
    await db
      .from("bulk_call_contacts")
      .update({
        status: "failed",
        status_reason: err.message,
        attempted_at: new Date().toISOString(),
      })
      .eq("id", contact.id);

    // Increment called_count for failed attempt
    const { data: camp } = await db
      .from("bulk_call_campaigns")
      .select("called_count")
      .eq("id", campaignId)
      .maybeSingle();

    if (camp) {
      await db
        .from("bulk_call_campaigns")
        .update({ called_count: (camp.called_count || 0) + 1 })
        .eq("id", campaignId);
    }

    // Try next contact after a 1.5s delay
    setTimeout(() => dialNextContact(campaignId), 1500);
  }
}

/**
 * POST /api/outbound/bulk/start
 * Kick off a bulk campaign by ID (campaign + contacts must already be in DB).
 */
export async function handleBulkCampaignStart(req: Request, res: Response): Promise<void> {
  const { campaignId, simulate } = req.body;
  if (!campaignId) {
    res.status(400).json({ error: "Missing campaignId." });
    return;
  }

  const { client: twilioClient } = await getDynamicTwilioClient();
  const publicBaseUrl = getPublicBaseUrl();

  if (simulate || !twilioClient) {
    // Simulation mode: mark campaign running and advance contacts with mock timers
    await db
      .from("bulk_call_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaignId);

    res.status(200).json({
      message: "Campaign started (Simulation / Demo mode).",
      campaignId,
      mode: "simulation",
    });

    simulateCampaignProgress(campaignId);
    return;
  }

  if (!publicBaseUrl) {
    res.status(500).json({ error: "PUBLIC_BASE_URL not set. Add tunnel URL to configuration." });
    return;
  }

  // Mark campaign as running
  await db
    .from("bulk_call_campaigns")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", campaignId);

  res.status(200).json({ message: "Campaign started.", campaignId });

  // Fire first call in background
  setTimeout(() => dialNextContact(campaignId), 500);
}

/**
 * POST /api/outbound/bulk/pause
 */
export async function handleBulkCampaignPause(req: Request, res: Response): Promise<void> {
  const { campaignId } = req.body;
  if (!campaignId) {
    res.status(400).json({ error: "Missing campaignId." });
    return;
  }

  await db
    .from("bulk_call_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId);

  res.status(200).json({ message: "Campaign paused.", campaignId });
}

/**
 * POST /api/outbound/bulk/resume
 */
export async function handleBulkCampaignResume(req: Request, res: Response): Promise<void> {
  const { campaignId } = req.body;
  if (!campaignId) {
    res.status(400).json({ error: "Missing campaignId." });
    return;
  }

  await db
    .from("bulk_call_campaigns")
    .update({ status: "running" })
    .eq("id", campaignId);

  res.status(200).json({ message: "Campaign resumed.", campaignId });

  setTimeout(() => dialNextContact(campaignId), 500);
}

/**
 * POST /api/outbound/bulk/retry-failed
 */
export async function handleBulkCampaignRetryFailed(req: Request, res: Response): Promise<void> {
  const { campaignId } = req.body;
  if (!campaignId) {
    res.status(400).json({ error: "Missing campaignId." });
    return;
  }

  // Reset failed and no_answer contacts to pending
  await db
    .from("bulk_call_contacts")
    .update({ status: "pending", status_reason: null })
    .eq("campaign_id", campaignId)
    .in("status", ["failed", "no_answer"]);

  await db
    .from("bulk_call_campaigns")
    .update({ status: "running" })
    .eq("id", campaignId);

  res.status(200).json({ message: "Failed contacts re-queued.", campaignId });

  setTimeout(() => dialNextContact(campaignId), 500);
}

/**
 * POST /api/outbound/bulk/call-status
 * Twilio status callback — fires when each campaign call completes.
 */
export async function handleBulkCallStatus(req: Request, res: Response): Promise<void> {
  const { CallStatus } = req.body;
  const campaignId = req.query.campaign_id as string;
  const contactId = req.query.contact_id as string;

  res.status(200).send("<Response></Response>");

  if (!campaignId || !contactId) return;

  clearContactWatchdog(contactId);
  clearCallPoller(contactId);

  const isFinal = ["completed", "busy", "no-answer", "failed", "canceled"].includes(CallStatus);

  if (CallStatus === "in-progress" || CallStatus === "answered") {
    await db
      .from("bulk_call_contacts")
      .update({ status: "answered" })
      .eq("id", contactId);
  } else if (CallStatus === "busy" || CallStatus === "no-answer" || CallStatus === "failed" || CallStatus === "canceled") {
    await db
      .from("bulk_call_contacts")
      .update({ status: "no_answer" })
      .eq("id", contactId);
  }

  if (isFinal) {
    if (CallStatus === "completed") {
      const { data: camp } = await db
        .from("bulk_call_campaigns")
        .select("answered_count")
        .eq("id", campaignId)
        .maybeSingle();
      if (camp) {
        await db
          .from("bulk_call_campaigns")
          .update({ answered_count: (camp.answered_count || 0) + 1 })
          .eq("id", campaignId);
      }
    }

    // Trigger next contact after current call ends
    setTimeout(() => dialNextContact(campaignId), 1500);
  }
}

/**
 * Simulation mode — advances campaign state without real provider calls.
 */
async function simulateCampaignProgress(campaignId: string) {
  const { data: contacts } = await db
    .from("bulk_call_contacts")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("position");

  if (!contacts || contacts.length === 0) {
    await db
      .from("bulk_call_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId);
    return;
  }

  let called = 0;
  let answered = 0;

  for (const contact of contacts) {
    const { data: currentCamp } = await db
      .from("bulk_call_campaigns")
      .select("status")
      .eq("id", campaignId)
      .maybeSingle();

    if (currentCamp?.status === "paused") {
      console.log(`[BulkCampaign] Simulation paused for ${campaignId}`);
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));
    const isAnswered = Math.random() > 0.3;
    await db
      .from("bulk_call_contacts")
      .update({ status: isAnswered ? "answered" : "no_answer", attempted_at: new Date().toISOString() })
      .eq("id", contact.id);
    called++;
    if (isAnswered) answered++;
    await db
      .from("bulk_call_campaigns")
      .update({ called_count: called, answered_count: answered })
      .eq("id", campaignId);
  }

  await db
    .from("bulk_call_campaigns")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", campaignId);
}
