# Requirements: CampusConnect AI

**Defined:** 2026-07-18
**Core Value:** The system must accurately and conversationally answer incoming student admission queries based strictly on the institutional knowledge base without hallucinating answers.

## v1 Requirements

### Core Telephony Leg (Twilio Connection)
- [ ] **TEL-01**: Express endpoint POST `/webhooks/twilio/voice` receives inbound triggers and checks active Supabase lines.
- [ ] **TEL-02**: Webhook routes to staff forwarding (`<Dial>`) if `ai_enabled` is false.
- [ ] **TEL-03**: Webhook starts WebSocket stream `<Connect><Stream url="wss://.../media-stream" /></Connect>` if true.
- [ ] **TEL-04**: Persistent WebSocket server parses Twilio start/stop events and streams raw 8kHz mulaw audio bytes.

### Voice Conversation Pipeline (STT -> LLM -> TTS)
- [ ] **CONV-01**: Deepgram streams real-time Speech-To-Text from raw student audio input.
- [ ] **CONV-02**: System prompt loads live database `kb_sections` into Claude's context to generate conversational replies.
- [ ] **CONV-03**: Claude answers are limited to 1-3 short, spoken sentences, admitting ignorance rather than inventing policy.
- [ ] **CONV-04**: ElevenLabs API receives Claude's output stream and converts it to a natural human voice stream.
- [ ] **CONV-05**: Output voice is downsampled/transcoded to 8kHz base64 mulaw audio bytes and pushed back to Twilio.
- [ ] **CONV-06**: Write student & AI transcript turns to the `call_transcripts` table immediately.

### Dashboard Integrations
- [ ] **DASH-01**: Dashboard Settings page plays voice audio directly when clicking the "Preview as audio" button by hitting POST `/api/tts/preview`.
- [ ] **DASH-02**: Outbound dialing batch triggered by hitting POST `/api/outbound/start` placing parallel calls.
- [ ] **DASH-03**: Active call hangup manually triggered from the dashboard hitting POST `/api/calls/:id/end`.

### Failover & Resilience
- [ ] **FAIL-01**: Failures in Deepgram, Claude, or ElevenLabs automatically redirect the caller to the line's staff number.
- [ ] **FAIL-02**: Log records scrub full phone numbers to protect student privacy.

## Out of Scope
- Direct local SIM carrier voice modification.
- Automated TRAI DLT consent records.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEL-01 | Phase 1 | Pending |
| TEL-02 | Phase 1 | Pending |
| TEL-03 | Phase 1 | Pending |
| TEL-04 | Phase 1 | Pending |
| CONV-01 | Phase 1 | Pending |
| CONV-02 | Phase 1 | Pending |
| CONV-03 | Phase 1 | Pending |
| CONV-04 | Phase 1 | Pending |
| CONV-05 | Phase 1 | Pending |
| CONV-06 | Phase 1 | Pending |
| DASH-01 | Phase 2 | Pending |
| DASH-02 | Phase 2 | Pending |
| DASH-03 | Phase 2 | Pending |
| FAIL-01 | Phase 1 | Pending |
| FAIL-02 | Phase 1 | Pending |

## v2 Requirements (Milestone 3)

### Bulk Calling
- [x] **BULK-01**: Download Excel/CSV template with Name + Phone Number columns.
- [x] **BULK-02**: Upload CSV/Excel and parse contacts client-side with preview table.
- [x] **BULK-03**: Create campaign (name, agent, phone line) and trigger sequential calls.
- [x] **BULK-04**: `bulk_call_campaigns` + `bulk_call_contacts` DB tables with RLS.
- [x] **BULK-05**: Server: `POST /api/outbound/bulk/start` starts campaign, fires calls sequentially.
- [x] **BULK-06**: Server: `POST /api/outbound/bulk/call-status` Twilio callback advances to next contact.
- [x] **BULK-07**: Simulation fallback when Twilio not configured (for demo/testing).
- [x] **BULK-08**: Live progress polling (5s interval) on campaign list page.

### Agent Analytics Dashboard
- [x] **ANALY-01**: Analytics page shows all agent cards with call counts + success rate.
- [x] **ANALY-02**: Click agent → per-agent dashboard: Total/Resolved/Forwarded/Flagged/Rate/AvgDur stat cards.
- [x] **ANALY-03**: 14-day bar chart of calls per day on agent dashboard.
- [x] **ANALY-04**: Per-agent call list table (all calls, clickable).
- [x] **ANALY-05**: Click call → detail overlay with AI summary banner + metadata grid + full transcript.
- [x] **ANALY-06**: `POST /api/analytics/call-summary/:callId` generates AI summary via key pool.
- [x] **ANALY-07**: `ai_summary` + `call_sentiment` columns added to `calls` table.

### BYOK AI API Key Pool
- [x] **BYOK-01**: `ai_provider_keys` DB table (provider, label, api_key, priority, usage, cost).
- [x] **BYOK-02**: Settings page: Add AI Key modal with provider selector (7 providers).
- [x] **BYOK-03**: Priority ordering with up/down controls.
- [x] **BYOK-04**: Active/Inactive toggle per key.
- [x] **BYOK-05**: Test Key button hits `POST /api/analytics/test-key`.
- [x] **BYOK-06**: Cumulative stats bar: total keys, tokens used, estimated spend.
- [x] **BYOK-07**: `aiKeyPool.ts` service: priority-ordered fallback chain for all AI calls.
- [x] **BYOK-08**: Cost estimation per provider stored in DB after each LLM call.

---
*Requirements updated: 2026-08-11 — Milestone 3 complete*
