# Codebase Concerns

**Analysis Date:** 2026-07-18

## Tech Debt

**Telephony Backend Integration:**
- Currently, the application is purely a frontend application integrated with Supabase.
- A persistent backend Node.js/Express server needs to be built, handling Webhook endpoints and a WebSocket media stream.
- The backend needs to reside in the codebase and run concurrently with Vite dev (using a proxy or distinct ports).

## Known Bugs

- None currently identified in the frontend dashboard pages.

## Security Considerations

- **Keys Protection:** Never expose `SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` or Twilio secrets to the client. These must reside solely on the orchestration server.
- **Data Privacy:** Do not log plaintext phone numbers in server logs. Always mask logs to the last 4 digits (e.g. `+91 ******1234`).

## Scaling Limits

- **ElevenLabs API limits:** Text-to-speech character generation is limited on free tiers (10k chars/month).
- **Twilio Trial Account limits:** Inbound/outbound calls can only interact with verified caller IDs. Real-world deployment requires upgrading the Twilio account.
- **Concurrency Cap:** Start with a concurrency limit of 3 simultaneous calls on outbound dialing to prevent LLM/TTS rate limits.

---
*Concerns analysis: 2026-07-18*
