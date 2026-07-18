# Phase 2: Dashboard Control Hooks — Specification

**Created:** 2026-07-18
**Ambiguity score:** 0.05 (gate: ≤ 0.20)
**Requirements:** 3 locked

## Goal

Expose endpoints for dashboard settings audio preview, outbound batch queues, and manual call overrides.

## Background

The dashboard has buttons for "Preview as audio", "End Call", and starting outbound batches, which are currently un-wired. This phase exposes the HTTP routing endpoints on the persistent Node.js Express server to handle these triggers.

## Requirements

1. **DASH-01: Voice Preview Route**
   - Current: Settings audio preview button displays a mockup toast.
   - Target: POST `/api/tts/preview` receives text, generates TTS audio (Neets/ElevenLabs), and streams `audio/mpeg` or `audio/wav` response to the client.
   - Acceptance: Hitting the endpoint returns playable audio streams.

2. **DASH-02: Outbound Batch Trigger**
   - Current: Dashboard starts batch mock animations.
   - Target: POST `/api/outbound/start` receives a number queue and line settings, placing outbound REST calls via Twilio Client.
   - Acceptance: Hitting the route initiates outbound Twilio legs with proper context parameter payloads.

3. **DASH-03: Remote Call Hangup Override**
   - Current: Call details has no remote terminate action.
   - Target: POST `/api/calls/:id/end` fetches the Twilio CallSid from the Supabase calls database, and updates its status to completed to disconnect the user.
   - Acceptance: Trigger terminates active calls.

## Boundaries

**In scope:**
- HTTP POST voice preview, outbound batch trigger, and end call endpoints.
- Integration with the Twilio SDK to dial and hang up calls.

**Out of scope:**
- Real-time page socket broadcasts (handled by Supabase realtime subscription directly).

## Constraints

- Refuse to execute outbound batches outside configured business hours.
- Outbound batches must respect a concurrency cap of 3 simultaneous calls.
