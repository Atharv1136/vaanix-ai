import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let twilioClient: twilio.Twilio | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
} else {
  console.warn("[Twilio] Missing Twilio credentials. Telephony features will be unavailable.");
}

export async function redirectCallToStaff(callSid: string, forwardToNumber: string): Promise<boolean> {
  if (!twilioClient) {
    console.error("[Twilio] Twilio client not initialized, cannot redirect.");
    return false;
  }

  try {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Please hold while I transfer you to the admission office.");
    twiml.dial(forwardToNumber);

    await twilioClient.calls(callSid).update({
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
  if (!twilioClient) return false;
  try {
    await twilioClient.calls(callSid).update({ status: "completed" });
    return true;
  } catch (error) {
    console.error(`[Twilio] Error hanging up call ${callSid}:`, error);
    return false;
  }
}
