# Context: Dashboard Control Hooks

**Phase:** 2 (Dashboard Control Hooks)
**Defined:** 2026-07-18
**Core Value:** Provide standard HTTP endpoints mapping the dashboard actions to telephony actions.

## Locked Decisions

### Voice Preview Endpoint (DASH-01)
- **Decision:** POST `/api/tts/preview` returning raw audio stream.
- **Rationale:** The dashboard plays voice presets by outputting the stream directly into the browser `<audio>` tag. Uses Neets.ai if `NEETS_API_KEY` is present, or falls back to ElevenLabs.

### Outbound batch Dialer (DASH-02)
- **Decision:** POST `/api/outbound/start` placing async calls.
- **Rationale:** The dashboard starts a queue-based batch, dialing up to 3 numbers simultaneously via Twilio REST calls, loading their call context correctly.

### Remote Hangup Override (DASH-03)
- **Decision:** POST `/api/calls/:id/end` terminating the active stream.
- **Rationale:** Remote disconnect ends the Twilio leg by sending a completed request to Twilio REST client API.

---
*Last updated: 2026-07-18 after initial discuss phase*
