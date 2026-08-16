import twilio from "twilio";
import { supabaseAdmin } from "./supabase";

const db = supabaseAdmin as any;

export interface TelephonyCredentials {
  provider: "twilio" | "plivo" | "custom";
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

/**
 * Fetch dynamic telephony credentials from database (app_settings) or .env fallback.
 */
export async function getTelephonyCredentials(): Promise<TelephonyCredentials> {
  try {
    const { data: settings } = await db
      .from("app_settings")
      .select("telephony_provider, telephony_account_sid, telephony_auth_token, telephony_phone_number")
      .eq("id", 1)
      .maybeSingle();

    if (settings?.telephony_account_sid && settings?.telephony_auth_token) {
      return {
        provider: settings.telephony_provider || "twilio",
        accountSid: settings.telephony_account_sid,
        authToken: settings.telephony_auth_token,
        phoneNumber: settings.telephony_phone_number || process.env.TWILIO_PHONE_NUMBER || "",
      };
    }
  } catch (err: any) {
    console.warn("[Telephony] Failed to load credentials from DB settings:", err.message);
  }

  // Fallback to environment variables
  return {
    provider: "twilio",
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  };
}

/**
 * Get dynamic Twilio client based on DB credentials or ENV.
 */
export async function getDynamicTwilioClient(): Promise<{
  client: twilio.Twilio | null;
  credentials: TelephonyCredentials;
}> {
  const creds = await getTelephonyCredentials();
  if (!creds.accountSid || !creds.authToken) {
    return { client: null, credentials: creds };
  }
  return {
    client: twilio(creds.accountSid, creds.authToken),
    credentials: creds,
  };
}

let staticTwilioClient: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio | null {
  if (!staticTwilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      staticTwilioClient = twilio(accountSid, authToken);
    } else {
      console.warn("[Twilio] Missing Twilio credentials in environment.");
    }
  }
  return staticTwilioClient;
}

export async function redirectCallToStaff(callSid: string, forwardToNumber: string): Promise<boolean> {
  const { client } = await getDynamicTwilioClient();
  if (!client) {
    console.error("[Twilio] Twilio client not initialized, cannot redirect.");
    return false;
  }

  try {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Please hold while I transfer you to the admission office.");
    twiml.dial(forwardToNumber);

    await client.calls(callSid).update({
      twiml: twiml.toString(),
    });
    console.log(`[Twilio] Call ${callSid} redirected to ${forwardToNumber}`);
    return true;
  } catch (error) {
    console.error(`[Twilio] Error redirecting call ${callSid}:`, error);
    return false;
  }
}

export async function hangupCall(callSid: string): Promise<boolean> {
  const { client } = await getDynamicTwilioClient();
  if (!client) return false;
  try {
    await client.calls(callSid).update({ status: "completed" });
    return true;
  } catch (error) {
    console.error(`[Twilio] Error hanging up call ${callSid}:`, error);
    return false;
  }
}
