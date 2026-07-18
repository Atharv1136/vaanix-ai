# External Integrations

**Analysis Date:** 2026-07-18

## APIs & External Services

**Telephony & Messaging:**
- Twilio (Planned) - Live student admissions telephone calls (Inbound routing + Outbound batch processing).
  - SDK/Client: `twilio` npm package.
  - Auth: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
  - Endpoints used: `calls.create`, REST redirects, Webhooks, and WebSockets.

**Speech-to-Text:**
- Deepgram (Planned) - Real-time speech transcription.
  - SDK/Client: `@deepgram/sdk` npm package.
  - Auth: `DEEPGRAM_API_KEY`.

**Conversational AI Brain:**
- Anthropic Claude API (Planned) - Intelligently answers questions based on Knowledge Base.
  - SDK/Client: `@anthropic-ai/sdk` npm package.
  - Auth: `ANTHROPIC_API_KEY`.
  - Models: Claude 3.5 Sonnet / Haiku.

**Text-to-Speech:**
- ElevenLabs (Planned) - Streams premium human-like voice response back to student.
  - SDK/Client: Direct fetch streaming API.
  - Auth: `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.

## Data Storage

**Databases & Auth:**
- Supabase (Active) - Primary datastore, Realtime subscriptions, and Staff Auth.
  - Client: `@supabase/supabase-js`.
  - Auth: Supabase JWT / Session tokens on the client; Service Role token (`SUPABASE_SERVICE_ROLE_KEY`) on the server to bypass RLS.
  - Migrations: Handled via Supabase CLI or SQL editor.

## CI/CD & Deployment

**Hosting:**
- Vite + TanStack Start (SSR) - Front-end handles static pages + CRUD via client Supabase client.
- Orchestration Node.js Server - Persistent websocket server for media streams must run on a persistent container (e.g. Railway, Render, Fly.io) to support streaming.

**Local Development:**
- ngrok - Exposes local port 3000 to public HTTPS and WSS endpoints for Twilio Webhooks testing.

## Environment Configuration

**Required Variables (.env):**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `DEEPGRAM_API_KEY`
- `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `PUBLIC_BASE_URL`
- `PORT`

---
*Integrations analysis: 2026-07-18*
