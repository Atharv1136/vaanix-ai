# System Architecture

**Analysis Date:** 2026-07-18

## Pattern Overview

**Overall:** Full-stack SSR Web App (TanStack Start) + Real-time Telephony Orchestrator (Node.js persistent server).

**Key Characteristics:**
- **Frontend Console:** SPA dashboards for configuring settings, managing the knowledge base, viewing transcripts, and starting outbound batches. Talks directly to Supabase.
- **Persistent Server Leg:** Handles real-time telephone streams via WebSockets (inbound and outbound) utilizing Twilio media streaming pipelines.
- **Modular Pipelines:** Streaming Speech-To-Text (Deepgram) -> Contextual LLM Brain (Claude + KB context) -> Streaming Text-to-Speech (ElevenLabs) -> Live Audio.

## Conceptual Layers

**UI Layer (Client):**
- React 19 SPA running under TanStack Router.
- Fetches and updates Supabase tables directly using supabase-js client.

**Server-Side Rendering (SSR) & Server Functions:**
- TanStack Start server functions executing on the server runtime.
- Authenticates API sessions and attaches tokens.

**Telephony & Audio Layer (Orchestration Server):**
- Express server + Node-ws server.
- Decodes Twilio base64 mulaw 8kHz audio packets, streams to Deepgram, pipes result to Claude, converts Claude stream to ElevenLabs voice stream, and plays back to Twilio.

**Persistence Layer:**
- Supabase PostgreSQL database tables: `calls`, `call_lines`, `call_transcripts`, `kb_sections`, `app_settings`, `staff`.

## Data Flow

### 1. Inbound Telephone Call:
1. Student dials the Twilio Phone Number.
2. Twilio hits the webhook `/webhooks/twilio/voice` on our orchestration server.
3. Server checks if `ai_enabled` is true for this number via Supabase `call_lines`.
4. If true: server returns TwiML with `<Connect><Stream url="wss://.../media-stream" /></Connect>`.
5. Twilio establishes a WebSocket connection, streaming raw 8kHz mulaw audio packet payloads to the WebSocket handler.
6. Handlers feed audio packets to Deepgram.
7. Deepgram returns raw text transcripts -> LLM -> ElevenLabs -> Audio sent back to Twilio.
8. Every turn (Student, AI) is saved immediately to `call_transcripts`.

## Entry Points

- `src/server.ts` - SSR entry point.
- `src/start.ts` - Client bootstrap.
- `src/index.ts` (To be created) - Backend Node.js server starting both the Express webhook routes and the WebSocket server.

---
*Architecture analysis: 2026-07-18*
