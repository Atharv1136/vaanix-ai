# Context: Voice Streaming Pipeline

**Phase:** 1 (Voice Streaming Pipeline)
**Defined:** 2026-07-18
**Core Value:** The system must accurately and conversationally answer incoming student admission queries based strictly on the institutional knowledge base without hallucinating answers.

## Locked Decisions

### Webhook Protocol & Framework (TEL-01, TEL-02)
- **Decision:** Express + standard Node.js `ws` library.
- **Rationale:** Minimal overhead, shared HTTP/WebSocket port, reuses standard JavaScript network patterns without framework baggage.

### Audio Processing & Buffering (TEL-04, CONV-05)
- **Decision:** Raw buffer accumulation (mulaw audio transcoding).
- **Rationale:** Keeps deployment server lightweight without requiring native `ffmpeg` binaries.

### Conversation Flow & Ignorance Policy (CONV-02, CONV-03)
- **Decision:** Graceful Ignorance + Transfer to staff.
- **Rationale:** If Claude does not find the answer in `kb_sections`, it will say "I don't have that detail in my system, let me forward you to our admissions office" and trigger a Twilio redirect.

### Failover Forwarding (FAIL-01)
- **Decision:** Immediate TwiML REST redirect to the line's `forward_to` desk number.
- **Rationale:** If any API error occurs (STT, TTS, LLM), the system transfers the student to a real human instead of dropping the call.

## Specifics

- **Greeting Persona:** Warm, helpful college admission counselor. Keeps answers to 1-3 short spoken sentences.
- **Data Insertion:** Write transcripts directly to Supabase `call_transcripts` turn-by-turn immediately.
- **Log Privacy:** Phone numbers must be masked to the last 4 digits in application console logs.

## Success Criteria

1. An inbound call to Twilio is answered and returns TwiML streaming code.
2. Voice input is transcribed via Deepgram.
3. Claude responds based strictly on database `kb_sections` context.
4. Voice output is streamed back via ElevenLabs to the student caller.
5. Failures trigger immediate call redirection to the staff number.

---
*Last updated: 2026-07-18 after initial discuss phase*
