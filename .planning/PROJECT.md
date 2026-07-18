# CampusConnect AI

## What This Is

An automated, AI-driven student admission-counseling calling dashboard and backend leg designed to answer inbound student queries, host batch outbound calls, update institutional knowledge base details, and review logs/transcripts. It serves as the digital front desk helper for the college admission cell.

## Core Value

The system must accurately and conversationally answer incoming student admission queries based *strictly* on the institutional knowledge base without hallucinating answers.

## Requirements

### Validated

- ✓ **DASH-01**: Dashboard analytics view showing today's call logs, durations, and top asked questions.
- ✓ **KB-01**: Knowledge base categories and card-based CRUD editor with auto-save.
- ✓ **LINES-01**: Active call lines listing with live toggle options for AI answering or forwarding.
- ✓ **LOGS-01**: Searchable call logs history and side-sheet transcript viewer.
- ✓ **AUTH-01**: Secure staff login portal via Supabase Auth.

### Active

- [ ] **TEL-01**: Twilio webhook integration to handle incoming calls and dynamically route to AI or forward to staff.
- [ ] **TEL-02**: Real-time websocket media stream server to accept voice bytes from Twilio.
- [ ] **TEL-03**: Streaming Deepgram Speech-To-Text connection to transcribe voice bytes.
- [ ] **TEL-04**: Claude System Prompt orchestration loaded with KB sections to generate short conversational answers.
- [ ] **TEL-05**: Streaming ElevenLabs Text-To-Speech audio output decoded to 8kHz mulaw base64 sent back to Twilio.
- [ ] **OUT-01**: Start outbound batch calling trigger to place automated queue-based calls.
- [ ] **PREV-01**: State preview audio output for checking TTS voices on the dashboard settings page.
- [ ] **ERR-01**: Graceful failover to forward ongoing calls to a staff number in case of LLM/audio generation failure.

### Out of Scope

- Indian DLT sender ID registrations - Must be handled institutionally by the college administration.
- Persistent GSM SIM local hardware voice injection - Restricted by mobile OS layers; Voice over Internet (IP) telephony is used instead.

## Constraints

- **Telephony Costs**: Telephony minutes, STT, LLM tokens, and TTS generation require trial credits or budget allocation.
- **Audio Specs**: Audio must be encoded/decoded precisely to 8kHz mono mulaw format to feed Twilio WebSocket streams.
- **Trial Limitations**: Twilio trial numbers can only call manually pre-verified caller IDs.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js Express + ws server | Needed for persistent websocket streams which serverless runtimes (Vercel) cannot maintain. | — Pending |

---
*Last updated: 2026-07-18 after project initialization*
