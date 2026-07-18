# Plan: Dashboard Control Hooks

**Phase:** 2 (Dashboard Control Hooks)
**Mode:** standard

## must_haves

- DASH-01: Express endpoint POST `/api/tts/preview` returns voice bytes (Neets/ElevenLabs) matching sent text.
- DASH-02: Express endpoint POST `/api/outbound/start` receives number arrays and triggers Twilio calls asynchronously up to a concurrency limit of 3.
- DASH-03: Express endpoint POST `/api/calls/:id/end` terminates ongoing calls using Twilio SDK client commands.

## Proposed Changes

### Wave 1: Control Endpoints
Depends on: Codebase map, Phase 1 server
Files modified:
- `src/server/routes/ttsPreview.ts` [NEW]
- `src/server/routes/calls.ts` [NEW]
- `src/server/routes/outbound.ts` [NEW]
- `src/server/index.ts` [MODIFY]

Tasks:
- Implement `src/server/routes/ttsPreview.ts` POST `/api/tts/preview`.
- Implement `src/server/routes/calls.ts` POST `/api/calls/:id/end` fetching the CallSid from the database and calling Twilio REST client API to complete the call.
- Implement queue runner `src/server/routes/outbound.ts` to trigger twilio outbound calls respecting business hours and a concurrency cap of 3.
- Register all routes in `src/server/index.ts`.

## Verification Plan

### Automated Tests
- Run `npm run build` to confirm compilation integrity.

### Manual Verification
- Hitting POST `/api/tts/preview` return bytes that play correctly inside an `<audio>` HTML tag.
- Triggering `/api/outbound/start` verifies Twilio starts outbound legs to the queue.
- Triggering remote end call hangs up the dial.
