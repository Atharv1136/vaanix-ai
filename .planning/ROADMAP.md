# Roadmap: CampusConnect AI

## Overview

We are building the telephony and AI voice processing backend for CampusConnect. We will build it in two phases: first establishing the core streaming webhook pipeline, and then introducing dashboard-specific backend hooks (such as outbound batches, settings voice previews, and remote hangups).

## Phases

- [ ] **Phase 1: Voice Streaming Pipeline** - Establish the Twilio Webhook, WebSocket handler, and the Deepgram-Claude-Elevenlabs media loop.
- [ ] **Phase 2: Dashboard Control Hooks** - Add endpoints for settings preview, batch outbound dialing, and manual call termination.

## Phase Details

### Phase 1: Voice Streaming Pipeline
**Goal**: Connect Twilio calls to the real-time AI conversation pipeline.
**Depends on**: Nothing (mapped codebase exists)
**Requirements**: TEL-01, TEL-02, TEL-03, TEL-04, CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06, FAIL-01, FAIL-02
**Success Criteria**:
  1. An inbound call to Twilio is answered and prints a dynamic TwiML socket connection.
  2. Spoken phrases from the student are transcribed by Deepgram in real-time.
  3. Claude receives the transcription, references Supabase `kb_sections` content, and replies conversationally.
  4. Claude's voice reply is spoken by ElevenLabs and heard back on the phone call.
  5. The entire transcript is saved to the database.

Plans:
- [ ] 01-01: Build server bootstrap, routes, and Supabase service connector wrappers.
- [ ] 01-02: Build WebSocket media stream handler with Deepgram, Claude, and Elevenlabs streaming integration.
- [ ] 01-03: Implement webhook routes, failovers, log scrubbing, and test with ngrok.

### Phase 2: Dashboard Control Hooks
**Goal**: Integrate the dashboard buttons to start outbound batches and preview voices.
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria**:
  1. Clicking "Preview as audio" on the settings page streams text-to-speech audio immediately.
  2. Uploading numbers and starting an outbound batch places multiple outgoing calls simultaneously.
  3. Clicking "End Call" on the dashboard ends the call via Twilio APIs.

Plans:
- [ ] 02-01: Build settings voice preview and manual hangup endpoints.
- [ ] 02-02: Implement outbound batch queue dialer.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Voice Streaming Pipeline | 0/3 | Not started | - |
| 2. Dashboard Control Hooks | 0/2 | Not started | - |

---
*Roadmap defined: 2026-07-18*
