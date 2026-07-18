# Plan: Voice Streaming Pipeline

**Phase:** 1 (Voice Streaming Pipeline)
**Mode:** standard

## must_haves

- TEL-01: Express server endpoint POST `/webhooks/twilio/voice` receives inbound triggers and verifies active lines.
- TEL-02: HTTP router redirects to configured staff forwarding `<Dial>` if `ai_enabled` is false.
- TEL-03: Webhook returns `<Connect><Stream url="wss://.../media-stream" /></Connect>` if `ai_enabled` is true.
- TEL-04: ws WebSocket media stream handler listens at `/media-stream`, parses start/media/stop events, and extracts raw base64 8kHz mulaw bytes.
- CONV-01: Deepgram real-time streaming STT connection transcribes incoming audio buffers.
- CONV-02: Claude system prompt initialized with database `kb_sections` content.
- CONV-03: Claude response is constrained to 1-3 short spoken sentences, strictly avoiding hallucinating non-KB facts.
- CONV-04: Claude reply chunks are sent to ElevenLabs voice stream.
- CONV-05: ElevenLabs audio is transcoded back to 8kHz mulaw base64 packets and pushed back to Twilio over the WebSocket connection.
- CONV-06: Database helper writes student & AI transcript turns to the `call_transcripts` table immediately.
- FAIL-01: Errors trigger Twilio REST redirect to the line's `forward_to` desk number.
- FAIL-02: Log records mask student phone numbers to the last 4 digits.

## Proposed Changes

### Wave 1: Server Infrastructure & Database Connector
Depends on: Codebase map
Files modified:
- `package.json`
- `tsconfig.json`
- `src/server/supabase.ts` [NEW]
- `src/server/twilioClient.ts` [NEW]
- `src/server/index.ts` [NEW]

Tasks:
- Configure backend dependencies in `package.json` (`express`, `ws`, `@deepgram/sdk`, `@anthropic-ai/sdk`, `twilio`, `dotenv`, `@types/ws`, `@types/express`).
- Implement database helper `src/server/supabase.ts` to load call line config, fetch knowledge base sections, save calls/transcripts, and increment common query metrics.
- Implement Express application bootstrap in `src/server/index.ts` listening on HTTP routes.

### Wave 2: WebSocket Streaming & AI Pipeline
Depends on: Wave 1
Files modified:
- `src/server/deepgram.ts` [NEW]
- `src/server/claude.ts` [NEW]
- `src/server/elevenlabs.ts` [NEW]
- `src/server/mediaStream/handler.ts` [NEW]
- `src/server/routes/twilioWebhook.ts` [NEW]

Tasks:
- Build `src/server/deepgram.ts` for real-time STT streaming.
- Build `src/server/claude.ts` to manage prompt formulation, referencing database knowledge base context, and streaming replies.
- Build `src/server/elevenlabs.ts` to convert text stream chunks to audio stream chunks.
- Build the core WebSocket pipeline `src/server/mediaStream/handler.ts` to wire up Twilio audio packets -> Deepgram -> Claude -> ElevenLabs -> Twilio.
- Implement `/webhooks/twilio/voice` endpoint in `src/server/routes/twilioWebhook.ts` to handle incoming calls.

## Verification Plan

### Automated Tests
- Run `npm run build` or `bun run build` to confirm compiler typecheck validation.
- Mock WebSocket inputs testing raw base64 buffer transcoding.

### Manual Verification
- Expose the port to ngrok: `ngrok http 3000`.
- Call the Twilio trial number using a verified caller ID.
- Speak queries about the college (e.g. course lists, fees, CAP round dates) and verify the AI counselor replies conversationally using database context.
- Verify transcripts are recorded in the database.
- Simulate an API error and verify the call successfully redirects to the configured staff desk phone.
