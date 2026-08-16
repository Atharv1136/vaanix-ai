# CampusConnect / Vaanix AI Assistant - Comprehensive Project Context & Handoff

## 1. Project Overview & Architecture

**CampusConnect / Vaanix AI Assistant** is an enterprise-grade AI-powered outbound and inbound calling platform. It enables educational institutions and organizations to create AI voice agents, manage phone numbers, run bulk calling campaigns, track live call logs with transcripts, inspect call analytics with sentiment summaries, and manage AI provider API keys.

### Architecture Stack
- **Frontend**: React 18, Vite, TanStack Router (SSR-capable), TanStack Query (React Query v5), Tailwind CSS, Framer Motion, Lucide Icons, Sonner toasts.
- **Backend**: Express.js server running on Node.js/tsx (`src/server/index.ts`).
- **Database & Auth**: Supabase (PostgreSQL, Realtime, PostgREST, RLS policies).
- **Voice Infrastructure**:
  - **Twilio / Plivo Voice API (BYOC)**: Dynamic Bring-Your-Own-Credentials for PSTN phone calls, Webhook TwiML generation, and WebSocket media stream bridging.
  - **Deepgram**: Handles Real-time Speech-To-Text (STT) and Text-To-Speech (TTS).
  - **Multi-Provider AI Key Pool (BYOK)**: Google Gemini, NVIDIA NIM, OpenAI, Groq, Anthropic, Together AI with priority ranking and live automatic fallback.
- **Public Tunnel**: Localtunnel (`https://vaanix-ai-tunnel.loca.lt`) exposing local server port 3000 to Twilio webhooks with `wss://` WebSocket support.

---

## 2. Comprehensive Log of Completed Work & Bug Fixes

### A. Bulk Calling System (`/bulk-calls`)

#### 1. Native Excel (`.xlsx` & `.xls`) and CSV File Parser with SheetJS
- Installed and integrated `xlsx` (SheetJS) into the client-side parser (`parseExcelOrCSV` in `src/routes/_authenticated/bulk-calls.tsx`).
- Converted numeric cell values with JavaScript `BigInt` formatting to prevent scientific notation truncation (`9.19562E+11`).

#### 2. Real-Time Sequential Calling & Watchdog Auto-Progression
- Built `dialNextContact` and `handleBulkCallStatus` in `src/server/routes/bulkCampaign.ts`.
- Outbound campaigns place calls sequentially (1-by-1), update contact status in real-time, and automatically advance to the next number when the current call finishes.
- **Watchdog Auto-Advancement**: Added a 75-second timeout guard per contact. If carrier network drops status callback, the contact is marked as timed-out and the campaign auto-advances to the next contact without getting stuck.
- **Campaign Controls**: Added Pause (`/api/outbound/bulk/pause`), Resume (`/api/outbound/bulk/resume`), and Retry Failed Contacts (`/api/outbound/bulk/retry-failed`) endpoints and UI buttons.

### B. Multi-Provider AI Key Pool & Automatic Fallback (`/settings`)

#### 1. Google Gemini & OpenAI-Compatible Pool
- Integrated **Google Gemini** as a first-class provider (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`) alongside NVIDIA, OpenAI, Groq, Anthropic, Together AI, and custom endpoints.
- Implemented **Priority Reordering & Ranking**: Users can rank keys (e.g. Gemini #1 → NVIDIA #2 → Groq #3) using Up/Down controls.

#### 2. Live Call Streaming Fallback (`streamAIReplyWithFallback`)
- In `src/server/services/aiKeyPool.ts`, implemented real-time sentence-level streaming generation across candidates.
- If the primary provider (e.g. Gemini) encounters any error or rate limit, it seamlessly falls back to the next ranked provider without dropping the call or triggering Twilio application errors.
- Includes a polite conversational fallback turn if all providers are temporarily unreachable.

### C. Live Telephony / Call Status Indicator in Navbar

- Added `NavbarCallStatus` in `src/routes/_authenticated/route.tsx`.
- Monitors active calls (`outcome: 'in_progress'`) and active bulk campaigns (`status: 'running'`).
- Subscribes in real-time via Supabase channel `navbar-telephony-status`.
- **States**:
  - `🟢 Line Status: Ready to Take Calls` (when idle).
  - `🔴 On Call (Active / ***1234)` (with pulsating radar animation and Live badge).
  - `📞 Campaign Calling (Called X/Y)` (with active progress counter and link to bulk calls).

### D. Telephony BYOC (Bring Your Own Credentials — Twilio / Plivo)

- Added **Telephony Provider (BYOC)** section in Settings (`src/routes/_authenticated/settings.tsx`).
- Enter Twilio / Plivo Account SID / Auth ID, Auth Token, and Outbound Phone Number.
- Automatically updates `app_settings` and syncs/creates a phone number row in `phone_numbers` table.
- Dynamic telephony client helper in `src/server/twilioClient.ts` reads credentials directly from DB at runtime without requiring server restart.

---

## 3. Database Schema Reference

### Table: `app_settings`
- `id` (INTEGER, PK, default 1)
- `org_name` (TEXT)
- `business_hours_start` (TIME)
- `business_hours_end` (TIME)
- `business_days` (TEXT)
- `default_greeting` (TEXT)
- `telephony_provider` (TEXT - 'twilio' | 'plivo' | 'custom')
- `telephony_account_sid` (TEXT)
- `telephony_auth_token` (TEXT)
- `telephony_phone_number` (TEXT)

### Table: `ai_provider_keys`
- `id` (UUID, PK)
- `provider` (`gemini` | `openai` | `anthropic` | `groq` | `openrouter` | `together` | `nvidia` | `custom`)
- `label` (TEXT)
- `api_key` (TEXT)
- `base_url` (TEXT)
- `model_override` (TEXT)
- `is_active` (BOOLEAN)
- `priority` (INT)
- `estimated_tokens_used` (BIGINT)
- `estimated_cost_usd` (NUMERIC)
- `last_used_at` (TIMESTAMPTZ)

### Table: `bulk_call_campaigns`
- `id` (UUID, PK)
- `name` (TEXT)
- `assistant_id` (UUID, FK -> assistants.id)
- `phone_number_id` (UUID, FK -> phone_numbers.id)
- `status` (`pending` | `running` | `paused` | `completed` | `failed`)
- `total_contacts` (INT)
- `called_count` (INT)
- `answered_count` (INT)
- `started_at` (TIMESTAMPTZ)
- `completed_at` (TIMESTAMPTZ)

### Table: `bulk_call_contacts`
- `id` (UUID, PK)
- `campaign_id` (UUID, FK -> bulk_call_campaigns.id)
- `name` (TEXT)
- `phone_number` (TEXT)
- `status` (`pending` | `calling` | `answered` | `no_answer` | `failed`)
- `status_reason` (TEXT - stores exact carrier/system error reason)
- `call_id` (UUID, FK -> calls.id)
- `position` (INT)
- `attempted_at` (TIMESTAMPTZ)

---

## 4. Running Server & Frontend

- **Backend Express Server**: `npm run server:run` (runs on port 3000).
- **Frontend Vite App**: `npm run dev` (runs on port 8080).
- **Public Tunnel**: `npx -y localtunnel --port 3000 --subdomain vaanix-ai-tunnel`.
