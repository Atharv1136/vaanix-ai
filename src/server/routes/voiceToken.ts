import { Request, Response } from "express";
import twilio from "twilio";

export async function handleVoiceToken(req: Request, res: Response): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  
  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    console.error("[VoiceToken] Missing Twilio credentials in environment");
    res.status(500).json({ error: "Missing Twilio configuration." });
    return;
  }

  try {
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create an access token
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: "voiceforge-browser-client",
      ttl: 3600 // 1 hour expiry
    });

    // Create a Voice grant and add it to the token
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false, 
    });
    
    token.addGrant(voiceGrant);

    // Return token to the client
    res.json({ token: token.toJwt() });
  } catch (error) {
    console.error("[VoiceToken] Error generating token:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
}
