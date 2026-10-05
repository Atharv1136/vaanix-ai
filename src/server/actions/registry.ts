import { ActionDefinition } from "./types";
import { handleCheckAvailability } from "./handlers/checkAvailability";
import { handleBookAppointment } from "./handlers/bookAppointment";
import { handleRescheduleAppointment } from "./handlers/rescheduleAppointment";
import { handleCancelAppointment } from "./handlers/cancelAppointment";
import { handleLookupAppointment } from "./handlers/lookupAppointment";
import { handleCaptureLead } from "./handlers/captureLead";
import { handleLookupFaq } from "./handlers/lookupFaq";
import { handleTransferToHuman } from "./handlers/transferToHuman";
import { handleSendSms } from "./handlers/sendSms";
import { handleCallWebhook } from "./handlers/callWebhook";
import { handleEndCallAction } from "./handlers/endCall";

export const ACTION_REGISTRY: Record<string, ActionDefinition> = {
  check_availability: {
    key: "check_availability",
    label: "Check Availability",
    description: "Check which appointment or consultation slots are free. Call this whenever the caller asks about availability or before offering any time. Never offer a time that this tool did not return.",
    phase: "live",
    spokenFallback: "I am having difficulty checking the schedule right now. Please allow me a moment.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format (defaults to today or tomorrow)" },
        service: { type: "string", description: "Optional specific service or treatment requested" },
        resource: { type: "string", description: "Optional specific practitioner, stylist, or agent ID" },
        duration_minutes: { type: "number", description: "Duration in minutes (defaults to 30)" },
      },
    },
    handler: handleCheckAvailability,
  },

  book_appointment: {
    key: "book_appointment",
    label: "Book Appointment",
    description: "Book an appointment or reservation. Call this only after the caller has confirmed a specific slot that check_availability returned AND you have their name and phone number AND you have repeated the details back and they said yes.",
    phase: "live",
    spokenFallback: "I had trouble completing the booking. Let me try once more.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name" },
        phone: { type: "string", description: "Caller's contact telephone number" },
        start_time: { type: "string", description: "Confirmed start time in ISO8601 format" },
        service: { type: "string", description: "Service or reason for the booking" },
        resource: { type: "string", description: "Specific staff, doctor, or resource ID" },
        reason: { type: "string", description: "Brief notes or symptoms/requirements stated by caller" },
      },
      required: ["name", "start_time"],
    },
    handler: handleBookAppointment,
  },

  reschedule_appointment: {
    key: "reschedule_appointment",
    label: "Reschedule Appointment",
    description: "Move the caller's existing appointment to a new time. Check availability for the new time first.",
    phase: "live",
    spokenFallback: "I cannot move that booking right now. Let me verify the schedule.",
    inputSchema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "ID of the existing appointment if known" },
        new_start_time: { type: "string", description: "The new requested ISO8601 date and time" },
        phone: { type: "string", description: "Caller's phone number" },
        duration_minutes: { type: "number", description: "Duration in minutes" },
      },
      required: ["new_start_time"],
    },
    handler: handleRescheduleAppointment,
  },

  cancel_appointment: {
    key: "cancel_appointment",
    label: "Cancel Appointment",
    description: "Cancel the caller's appointment after they clearly confirm they want to cancel.",
    phase: "live",
    spokenFallback: "I could not cancel that booking immediately. I will alert our reception desk.",
    inputSchema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "Appointment ID if known" },
        phone: { type: "string", description: "Caller's phone number" },
        reason: { type: "string", description: "Reason for cancellation" },
      },
    },
    handler: handleCancelAppointment,
  },

  lookup_appointment: {
    key: "lookup_appointment",
    label: "Lookup Appointment",
    description: "Look up the caller's upcoming appointments so you can tell them what they have booked.",
    phase: "live",
    spokenFallback: "I am having trouble looking up your booking. Please hold on.",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Caller's phone number" },
      },
    },
    handler: handleLookupAppointment,
  },

  capture_lead: {
    key: "capture_lead",
    label: "Capture Lead / Inquire",
    description: "Save caller details when they express interest in properties, custom services, quotes, support callbacks, or payment promises.",
    phase: "live",
    spokenFallback: "Thank you, I have noted that down for our team to follow up.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact full name" },
        phone: { type: "string", description: "Contact phone number" },
        email: { type: "string", description: "Contact email address" },
        interest: { type: "string", description: "Product, service, property, or issue inquiry" },
        notes: { type: "string", description: "Additional details, budget, timeline, or promise to pay" },
        fields: { type: "object", description: "Arbitrary key-value metadata" },
      },
    },
    handler: handleCaptureLead,
  },

  lookup_faq: {
    key: "lookup_faq",
    label: "Lookup FAQ & Knowledge",
    description: "Search the business's knowledge base for fees, address, timings, policies, practitioner details, or return policies.",
    phase: "live",
    spokenFallback: "Let me check with our reception team on that detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or question about the business" },
      },
      required: ["query"],
    },
    handler: handleLookupFaq,
  },

  transfer_to_human: {
    key: "transfer_to_human",
    label: "Transfer to Human",
    description: "Transfer the call to a human staff member or supervisor. Use for medical emergencies, severe billing disputes, or when the caller insists on speaking with a person.",
    phase: "live",
    spokenFallback: "Please hold while I transfer you to our human representative.",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for the transfer" },
        transfer_number: { type: "string", description: "Optional override phone number to transfer to" },
      },
    },
    handler: handleTransferToHuman,
  },

  send_sms: {
    key: "send_sms",
    label: "Send SMS Message",
    description: "Send an SMS message to the caller, such as clinic/office address directions, booking confirmation, or payment link.",
    phase: "live",
    spokenFallback: "I will make sure our system texts you the full details shortly.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient mobile phone number (defaults to caller)" },
        body: { type: "string", description: "Exact SMS text message body to send" },
      },
    },
    handler: handleSendSms,
  },

  call_webhook: {
    key: "call_webhook",
    label: "Call Webhook",
    description: "Call the business's own external CRM or ERP system to query order status or trigger external workflows.",
    phase: "live",
    spokenFallback: "Our external database is taking longer than expected to respond.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Action or event name" },
        args: { type: "object", description: "Payload arguments to send" },
        endpoint: { type: "string", description: "Optional webhook URL override" },
      },
      required: ["name"],
    },
    handler: handleCallWebhook,
  },

  end_call: {
    key: "end_call",
    label: "End Call",
    description: "Gracefully hang up the phone call after the conversation is completely finished and pleasantries have been exchanged.",
    phase: "live",
    spokenFallback: "Thank you for calling. Goodbye!",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for ending the call" },
      },
    },
    handler: handleEndCallAction,
  },
};

export function getActionDefinition(key: string): ActionDefinition | undefined {
  return ACTION_REGISTRY[key];
}

export function getAllActionTools(enabledKeys?: string[]) {
  const keys = enabledKeys && enabledKeys.length > 0 ? enabledKeys : Object.keys(ACTION_REGISTRY);
  return keys
    .map((k) => ACTION_REGISTRY[k])
    .filter(Boolean)
    .map((action) => ({
      type: "function" as const,
      function: {
        name: action.key,
        description: action.description,
        parameters: action.inputSchema,
      },
    }));
}
