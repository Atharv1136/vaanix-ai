# Phase 1: Voice Streaming Pipeline — Specification

**Created:** 2026-07-18
**Ambiguity score:** 0.05 (gate: ≤ 0.20)
**Requirements:** 12 locked

## Goal

Establish the webhook routing endpoint, persistent WebSocket media streaming server, and live STT->LLM->TTS audio conversion loops.

## Background

Currently, the campusconnect-ai-assistant codebase contains a React frontend integrated directly with Supabase. It has pages for managing call lines, transcripts, logs, and settings, but lacks the backend telephony execution server. This phase implements the persistent Node.js/Express server to accept real-time voice streams from Twilio, run transcript processing via Deepgram, Claude, and ElevenLabs, and push response audio back to the student.

## Requirements

1. **TEL-01: Express Webhook Route**
   - Current: No backend endpoint to receive call notifications.
   - Target: POST `/webhooks/twilio/voice` endpoint parses incoming Twilio headers (To/From/CallSid).
   - Acceptance: Hitting the route with a valid mock Twilio body returns a 200 XML response with TwiML instructions.

2. **TEL-02: Forwarding Fallback**
   - Current: Call line toggles are ignored since no server exists.
   - Target: If `ai_enabled` is false on the database row for the dialed phone number, webhook returns TwiML `<Dial>` forwarding to the staff member's number.
   - Acceptance: DB mock query with `ai_enabled: false` returns TwiML containing `<Dial>[forward_to_number]</Dial>`.

3. **TEL-03: Media Stream Connection**
   - Current: No websocket stream configuration.
   - Target: If `ai_enabled` is true, webhook returns TwiML with `<Connect><Stream url="wss://.../media-stream" /></Connect>`.
   - Acceptance: DB query with `ai_enabled: true` returns TwiML `<Stream url="..." />`.

4. **TEL-04: Persistent WebSocket Handler**
   - Current: No persistent WebSocket listener.
   - Target: A Node.js `ws` server listening on a dedicated route to parse Twilio media messages (start, media, stop).
   - Acceptance: Media events extract binary audio payload data chunks.

5. **CONV-01: Deepgram Transcriber Connection**
   - Current: No live STT streaming.
   - Target: Raw mulaw audio payloads from Twilio are piped directly into Deepgram's real-time streaming WebSocket.
   - Acceptance: Deepgram connection handles streaming events and returns transcribed text segments.

6. **CONV-02: Knowledge Base Sourcing**
   - Current: No database retrieval inside call flows.
   - Target: Pull all matching category items from `kb_sections` on call startup to feed the prompt.
   - Acceptance: The generated prompt incorporates the exact text content from the database.

7. **CONV-03: Prompt Personality Guard**
   - Current: No prompt instructions.
   - Target: System prompt instructs Claude to reply in 1-3 short spoken sentences, strictly based on the KB.
   - Acceptance: Prompt limits answers and commands Claude to transfer if a detail is missing.

8. **CONV-04: ElevenLabs TTS Stream**
   - Current: No voice generation.
   - Target: Send Claude's output stream in chunks to ElevenLabs to receive audio streams.
   - Acceptance: ElevenLabs returns voice audio bytes matching Claude's reply.

9. **CONV-05: Audio Packet Push**
   - Current: No output streaming.
   - Target: Output audio is transcoded to 8kHz mulaw base64 and pushed as `media` events to Twilio.
   - Acceptance: WebSocket outputs valid base64 audio frames matching Twilio specifications.

10. **CONV-06: Transcript Logging**
    - Current: Transcripts are only simulated.
    - Target: Write student & AI transcript turns to the `call_transcripts` table immediately.
    - Acceptance: DB writes appear instantly per turn with correct turn indexes.

11. **FAIL-01: Failover Redirection**
    - Current: API failures crash or leave user in silence.
    - Target: Wrap Deepgram, Claude, ElevenLabs in try/catch. On failure, issue a REST API redirect to `<Dial>` the staff line.
    - Acceptance: Artificially throwing errors triggers Twilio redirect logic.

12. **FAIL-02: Privacy Log Scrubbing**
    - Current: Plaintext numbers are printable.
    - Target: Scrub logs to only display the last 4 digits of phone numbers.
    - Acceptance: Console outputs do not display full numbers.

## Boundaries

**In scope:**
- HTTP POST Webhook route.
- WebSocket server routing Twilio media streams.
- Deepgram, Claude, Elevenlabs pipeline.
- Live Supabase integration (Service role) for calls, transcripts, and KB sourcing.

**Out of Scope:**
- Settings preview, manual hangups, and outbound Batches (Deferred to Phase 2).

## Constraints

- Audio streams must match Twilio's expected 8kHz mono mulaw format.
- Do not print full student phone numbers in application console logs.

## Acceptance Criteria

- [ ] Inbound webhook returns valid XML TwiML.
- [ ] WebSocket server accepts incoming streams.
- [ ] Deepgram transcriber triggers text returns.
- [ ] Claude loads live database `kb_sections`.
- [ ] Audio stream matches Twilio base64 format.
- [ ] Errors trigger Twilio REST redirect to the staff desk phone.
- [ ] Transcripts are recorded to `call_transcripts` turn-by-turn.
