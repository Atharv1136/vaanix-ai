# VAANIX Update — Build Prompt
### Paste this into your AI coding agent (Claude Code, Lovable, Cursor). Work phase by phase.

---

## 0. How to work (read first)

You are extending an **existing, working** application. Do not rewrite it.

1. Read the existing code before changing anything: `src/server/index.ts`, `src/server/services/claude.ts`, `deepgram.ts`, `elevenlabs.ts`, `src/server/routes/*`, `src/routes/_authenticated/*`, `src/styles.css`, `supabase/` migrations.
2. **Do not break the live voice pipeline** (Twilio -> Deepgram -> Claude -> ElevenLabs -> Twilio). Every change to it must be additive and covered by a fallback.
3. Reuse the existing design system (dark, glassmorphic, current tokens in `styles.css`) and existing UI primitives (Radix, Tailwind, Lucide, Framer Motion, Recharts). Do not introduce a second UI library.
4. Build in the **phases listed in section 12**. After each phase, stop, summarise what changed, list files touched, and tell me how to test it. Do not start the next phase until I say so.
5. Never invent availability data, API responses or fake success states in the UI. Empty states must be honest.
6. Keep code typed (TypeScript strict), validate all inputs on the server (zod), and never expose service keys or OAuth tokens to the browser.

---

## 1. Product context

**VAANIX** is a Voice AI Agent platform. A business creates an AI agent that answers (and makes) real phone calls.

Current stack:
- Frontend: React 19, TanStack Router/Start, Tailwind 4, Radix UI, Framer Motion, Recharts.
- Backend: Express 5 with `ws` WebSockets, TypeScript via `tsx`.
- Voice pipeline: Twilio Media Streams (mulaw over WebSocket) -> Deepgram streaming STT -> Claude (streaming) -> ElevenLabs TTS (Edge TTS and NVIDIA NIM as fallbacks) -> back to Twilio.
- Database/Auth: Supabase PostgreSQL with RLS. Service role key only on the server.
- Existing tables: `assistants`, `calls`, `phone_numbers`, `assistant_qas`. Existing routes: `assistants.ts`, `assistantQas.ts`, `calls.ts`, `outbound.ts`, `phoneAndKb.ts`, `ttsPreview.ts`, `twilioWebhook.ts`, `voicePreview.ts`, `voiceToken.ts`.
- Existing console pages: Assistants, Call Logs, Phone Numbers, and a dashboard with generic stats.

### The problem with today's product
The home dashboard shows generic analytics and the agent list. The agent can only **talk**. It cannot **do** anything (book, check, send, transfer). A doctor who adopts VAANIX gets a chatbot, not a working appointment system.

### What this update achieves
1. Agents get **actions** (tools) they can call live during a call, chosen while creating the agent.
2. The **home tab becomes the client's Business Workspace** (for a doctor: a real appointments calendar).
3. **All agent-related work moves into one tab, Agent Studio.**
4. Outbound calling gets a **single call dialog and bulk CSV campaigns**.

### Concrete motivating example (use it to drive every decision)
Dr. Mehta runs a clinic. He signs up, picks the **Clinic** template, enables the appointment actions, adds his fees and address to the knowledge base, attaches a number. Patients call. The AI asks whether it is a first visit or follow-up, **checks real availability**, books the slot, confirms it by voice and SMS. Dr. Mehta opens VAANIX and the **home tab shows his calendar** with the booking already on it, linked to the call transcript. He rarely visits Agent Studio.

---

## 2. Information architecture (implement exactly)

Sidebar (icon-only collapsed on desktop, drawer on mobile, as today):

1. **Workspace** (home, route `/`) — the business view. Content depends on the account's domain pack.
2. **Agent Studio** (route `/studio/*`) — everything about agents.
3. **Phone Numbers** (route `/phone-numbers`) — keep as is.
4. **Account** — profile, business profile (name, timezone, hours), sign out.

Agent Studio has sub-tabs (route segments):

| Route | Content |
|---|---|
| `/studio/agents` | Agent list, create, edit, duplicate, pause |
| `/studio/agents/new` | Create wizard |
| `/studio/agents/$id` | Edit agent (tabs: Basics, Model and Voice, Actions, Knowledge, Number) |
| `/studio/knowledge` | Knowledge base across agents (QA pairs, text, documents, test search) |
| `/studio/integrations` | Google Calendar, SMS, webhooks, API keys |
| `/studio/calls` | Call logs with transcript, summary, and **actions executed** per call |
| `/studio/outbound` | Single call dialog and bulk campaigns |

Move the existing Assistants and Call Logs screens into these routes (keep old URLs redirecting). The old generic stats become a small, collapsible strip at the top of Agent Studio, **not** the home page.

---

## 3. Domain packs

A domain pack is **configuration**, not code. Create `src/server/domainPacks/` (shared types in `src/lib/domainPacks.ts`) with this shape:

```ts
type DomainPack = {
  key: 'clinic' | 'salon' | 'real_estate' | 'support' | 'collections' | 'generic';
  displayName: string;
  systemPromptTemplate: string;       // domain personality and rules
  defaultActions: ActionKey[];        // pre-enabled in the wizard
  workspaceModules: WorkspaceModule[]; // what the home tab renders
  starterServices?: { name: string; durationMin: number }[];
  safetyRules: string[];              // appended to every prompt
};
```

Implement **clinic** fully. Add `generic` as a minimal pack (contacts + call outcomes). Stub `salon`, `real_estate`, `support`, `collections` as typed config objects with their default actions, so the wizard can list them, but mark them "coming soon" in the UI until their Workspace modules exist (phase 6).

**Clinic pack contents**

- `defaultActions`: `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `lookup_appointment`, `lookup_faq`, `transfer_to_human`, `send_sms`.
- `workspaceModules`: `calendar`, `appointments_table`, `contacts_table` (labelled "Patients"), `availability_settings`.
- `starterServices`: "Consultation" (15 min), "Follow-up" (10 min).
- `safetyRules`: see section 7.
- `systemPromptTemplate`: a receptionist persona for a clinic (warm, brief, spoken style), instructs to ask first visit vs follow-up, to collect name and phone, to confirm details before booking, never to give medical advice or diagnosis, and to use tools for anything about schedules.

Only **three reusable Workspace module types** exist: Calendar, Table (with filters and detail drawer), Board (kanban). Packs choose which to show. Do not hardcode doctor-specific screens outside the clinic pack config.

---

## 4. Data model (Supabase migration)

Create a new migration file. Keep existing tables. Enable RLS on every new table with policies scoped to `auth.uid() = user_id` (or via join to an owned parent). The server uses the service role and must still filter by `user_id`.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Business profile (one per account)
CREATE TABLE business_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_pack text NOT NULL DEFAULT 'generic',
  business_name text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  working_hours jsonb NOT NULL DEFAULT '{"mon":[["10:00","20:00"]],"tue":[["10:00","20:00"]],"wed":[["10:00","20:00"]],"thu":[["10:00","20:00"]],"fri":[["10:00","20:00"]],"sat":[["10:00","14:00"]],"sun":[]}',
  transfer_number text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE resources (            -- doctor / stylist / room / table
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'doctor',
  working_hours jsonb,              -- null = inherit business hours
  calendar_id text,                 -- external calendar, optional
  active boolean DEFAULT true
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_min int NOT NULL DEFAULT 15,
  buffer_min int NOT NULL DEFAULT 0,
  price numeric
);

CREATE TABLE time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text, phone text NOT NULL, email text,
  fields jsonb DEFAULT '{}',
  do_not_call boolean DEFAULT false,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, phone)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id),
  service_id uuid REFERENCES services(id),
  contact_id uuid REFERENCES contacts(id),
  call_id uuid REFERENCES calls(id),
  agent_id uuid REFERENCES assistants(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','confirmed','completed','no_show','cancelled')),
  source text DEFAULT 'ai_call',    -- ai_call | manual
  notes text,
  external_event_id text,
  sync_status text DEFAULT 'none',  -- none | synced | failed
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('booked','confirmed'))
);

CREATE TABLE agent_actions (
  agent_id uuid NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (agent_id, action_key)
);

CREATE TABLE action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES assistants(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  action_key text NOT NULL,
  input jsonb, output jsonb,
  status text NOT NULL,             -- ok | error | timeout
  duration_ms int,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,           -- google_calendar | twilio_sms | webhook
  credentials_encrypted text,       -- never selectable from the browser
  status text DEFAULT 'connected',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, call_id uuid,
  to_number text, channel text DEFAULT 'sms',
  body text, status text, created_at timestamptz DEFAULT now()
);

CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL, run_at timestamptz NOT NULL,
  payload jsonb, status text DEFAULT 'pending'
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES assistants(id),
  name text NOT NULL,
  status text DEFAULT 'draft',      -- draft | running | paused | done
  calling_window jsonb DEFAULT '{"start":"10:00","end":"18:00"}',
  max_concurrent int DEFAULT 2,
  retry_rules jsonb DEFAULT '{"max_attempts":2,"gap_minutes":120}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE campaign_contacts (
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  variables jsonb DEFAULT '{}',
  status text DEFAULT 'queued',     -- queued | ringing | in_progress | completed | failed | skipped
  attempts int DEFAULT 0,
  last_call_id uuid,
  outcome text,
  PRIMARY KEY (campaign_id, contact_id)
);

ALTER TABLE assistants
  ADD COLUMN IF NOT EXISTS domain_pack text DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS greeting text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS sentiment text;
```

Also enable Supabase Realtime on `appointments`, `calls`, and `campaign_contacts` so the UI updates without refresh.

All timestamps are `timestamptz` stored in UTC and displayed in the business timezone. Do not store local times.

**Source of truth rule:** our `appointments` table is the truth. Google Calendar is only a mirror we push to. A calendar outage must never block a booking.

---

## 5. Action engine

Create `src/server/actions/` with:

```
registry.ts        // all action definitions
types.ts           // ActionDefinition, ActionContext, ActionResult
runner.ts          // executes an action: validate -> run with timeout -> log to action_runs
handlers/          // one file per action
```

```ts
type ActionDefinition = {
  key: ActionKey;
  label: string;
  description: string;               // what Claude reads to decide when to call it
  phase: 'live' | 'post_call';
  inputSchema: JSONSchema;           // becomes the Claude tool input_schema
  configSchema: JSONSchema;          // drives the config form in Agent Studio
  requires?: ('google_calendar' | 'twilio_sms')[];
  spokenFallback: string;            // said by the agent if the handler fails
  handler: (input: unknown, ctx: ActionContext) => Promise<ActionResult>;
};

type ActionContext = {
  userId: string; agentId: string; callId: string;
  callerNumber: string; businessProfile: BusinessProfile;
  config: Record<string, unknown>;   // from agent_actions.config
  now: Date;
};
```

**Runner rules**
- Validate input with zod derived from `inputSchema`. Invalid input returns `{ ok:false, error:"invalid_input", details }` to Claude, never throws.
- Every handler runs with a timeout. On timeout return `{ ok:false, error:"timeout" }`.
- Log every run to `action_runs` (input, output, status, duration).
- Handlers return **small** JSON. Claude is waiting and the caller is in silence.
- A handler must never throw into the voice pipeline. Catch everything.

### Action specifications

Implement each exactly as described. "Claude-facing description" is the literal text to put in the tool description.

#### 5.1 `check_availability` (live)
- **Claude-facing description:** "Check which appointment slots are free. Call this whenever the caller asks about availability or before offering any time. Never offer a time that this tool did not return."
- **Input:** `{ date: "YYYY-MM-DD", from?: "HH:MM", to?: "HH:MM", service?: string, resource?: string }`
- **Config:** `slotLengthMin` (default from service), `maxSlotsReturned` (default 3), `bookAheadDays` (default 30).
- **Backend:**
  1. Load business profile (timezone, hours), the resource (default: first active), the service duration and buffer.
  2. Build candidate slots from working hours for that date, within `from`/`to`.
  3. Remove slots overlapping `appointments` with status booked/confirmed, `time_off`, and times earlier than now.
  4. Return up to `maxSlotsReturned` slots nearest to `from`.
- **Output:** `{ ok:true, date, slots:["17:00","17:30","18:30"] }`.
- **Edge cases:** no slots -> `{ ok:true, slots:[], nextAvailableDates:["2026-10-07","2026-10-08","2026-10-09"] }`. Past date -> `{ ok:false, error:"date_in_past" }`. Beyond `bookAheadDays` -> `{ ok:false, error:"too_far_ahead" }`.

#### 5.2 `book_appointment` (live)
- **Claude-facing description:** "Book an appointment. Call this only after the caller has confirmed a specific slot that check_availability returned AND you have their name and phone number AND you have repeated the details back and they said yes."
- **Input:** `{ name: string, phone?: string, start_time: ISO8601 with offset, service?: string, reason?: string }`
- **Config:** `askReason` (bool), `sendConfirmationSms` (bool), `defaultStatus` ("booked" | "confirmed").
- **Backend:**
  1. Normalise phone to E.164 (default country from business profile; fall back to caller ID if `phone` missing).
  2. Validate the slot is inside working hours and in the future.
  3. In **one transaction**: upsert `contacts`, insert `appointments`. The exclusion constraint is the final guard against double booking. Catch the constraint violation.
  4. Link `call_id` and `agent_id`.
  5. If Google Calendar is connected, push the event (outside the transaction). Store `external_event_id`, set `sync_status` to `synced` or `failed` (and enqueue a retry in `scheduled_jobs`). A failed sync does NOT fail the booking.
  6. If `sendConfirmationSms`, enqueue the confirmation (post-call).
- **Output ok:** `{ ok:true, appointment_id, start, end, display:"Tuesday 6 October, 5:30 PM" }`.
- **Output conflict:** `{ ok:false, error:"slot_taken", alternatives:["18:30","19:00"] }` (compute alternatives by calling the same slot logic).
- **Idempotency:** same phone + same slot returns the existing appointment with `ok:true, already_booked:true`.

#### 5.3 `reschedule_appointment` (live)
- **Description:** "Move the caller's existing appointment to a new time. Check availability for the new time first."
- **Input:** `{ phone?: string, current_date?: "YYYY-MM-DD", new_start_time: ISO8601 }`
- **Backend:** find active appointments for the contact (caller ID default). One match -> proceed. Several -> return `{ ok:false, error:"multiple_matches", options:[{id,display}] }` so Claude asks which. None -> `{ ok:false, error:"not_found" }`. Update times in a transaction (constraint applies), update the calendar event.
- **Output:** `{ ok:true, old_display, new_display }`.

#### 5.4 `cancel_appointment` (live)
- **Description:** "Cancel the caller's appointment after they clearly confirm they want to cancel."
- **Input:** `{ phone?: string, date?: "YYYY-MM-DD", reason?: string }`
- **Config:** `cancellationWindowHours` (flag `late_cancel` in notes if inside window, still cancel).
- **Backend:** find, set status `cancelled`, remove the calendar event, return `{ ok:true, cancelled_display }`.

#### 5.5 `lookup_appointment` (live)
- **Description:** "Look up the caller's upcoming appointments so you can tell them what they have booked."
- **Input:** `{ phone?: string }`
- **Output:** `{ ok:true, appointments:[{ display, service, status }] }` (max 3).

#### 5.6 `capture_lead` (live)
- **Description:** "Save the caller's details when they show interest but are not booking now."
- **Input:** `{ name?: string, phone?: string, fields?: object }` where `fields` holds domain data (budget, location, interest, preferred time).
- **Backend:** upsert contact by phone, merge `fields`, tag `source = agent name`.

#### 5.7 `lookup_faq` (live)
- **Description:** "Search the business's knowledge base for fees, address, timings, policies, doctor details. Use this before answering any factual question about the business."
- **Input:** `{ query: string }`
- **Backend (phase 1):** search `assistant_qas` plus knowledge text for that agent using Postgres full-text search, return the top 3 snippets. (Upgrade to embeddings later; keep the same interface.)
- **Output:** `{ ok:true, results:[{ q, a }] }` or `{ ok:true, results:[] }`. Empty results means Claude must say it will have someone call back, never guess.

#### 5.8 `transfer_to_human` (live)
- **Description:** "Transfer the call to a human. Use immediately for medical emergencies, angry callers, or when you cannot help."
- **Input:** `{ reason: string }`
- **Config:** `transferNumber` (falls back to `business_profiles.transfer_number`), `announce` (text spoken before transfer).
- **Backend:** speak the announcement, then update the live Twilio call using the REST API with TwiML `<Dial>` to the number. Mark the call `outcome = transferred`. Notify the owner (SMS or email). If the number is missing, return `{ ok:false, error:"no_transfer_number" }` and the agent takes a message instead.

#### 5.9 `send_sms` (live)
- **Description:** "Send an SMS to the caller, for example the clinic address or a confirmation."
- **Input:** `{ template?: string, body?: string, to?: string }`
- **Backend:** fill template variables from context ({{name}}, {{date}}, {{time}}, {{business}}), send via Twilio, log in `messages`. Default recipient is the caller.

#### 5.10 `call_webhook` (live)
- **Description:** "Call the business's own system to look up or create something. Use only as instructed in the agent's prompt."
- **Input:** `{ name: string, args: object }`
- **Config:** `url`, `secret`, `timeoutMs`.
- **Backend:** POST `{ call_id, agent_id, action: name, args }` with an HMAC signature header. Return the JSON response truncated to a safe size. Non-2xx or timeout -> `{ ok:false }` and the action's spoken fallback is used.

#### 5.11 `end_call` (live)
- Let the current audio finish, then close the stream and finalise the call.

#### 5.12 Post-call actions (run once after hangup, inside a `finalizeCall(callId)` function)
1. `post_call_summary`: send the transcript to Claude with a fixed prompt returning JSON `{ summary, outcome, sentiment, action_items[] }`. Outcome values: `booked`, `rescheduled`, `cancelled`, `info_only`, `lead`, `transferred`, `no_resolution`. Store on `calls`.
2. `send_confirmation`: if an appointment was created in this call and the setting is on, send the confirmation SMS template.
3. `schedule_reminder`: insert a `scheduled_jobs` row at `start_at` minus the configured offset (default 24 hours before).
4. `notify_owner`: for outcome `transferred` or emergency flags.

Write a tiny worker (setInterval in the server process is fine for now) that picks due `scheduled_jobs` and processes them. Cancelled appointments cancel their reminder jobs.

---

## 6. Changes to the Claude service (`claude.ts`)

Add tool use **without** removing existing behaviour. If an agent has no enabled actions, behaviour is exactly as today.

1. **Build tools:** load `agent_actions` where `enabled`, take live actions, convert each to a Claude tool: `{ name: key, description, input_schema }`.
2. **Build the system prompt** at call start (and refresh `now` each turn) in this order:
   1. Base voice rules (section 7.1).
   2. Domain pack `systemPromptTemplate`.
   3. The agent's own custom prompt from the Basics tab.
   4. Business context block (section 7.2).
   5. Per-action usage hints (section 7.3), only for enabled actions.
   6. Domain `safetyRules`.
3. **Streaming loop:** stream the response. When a `tool_use` block completes:
   1. If the model produced no text before the tool, send a short filler phrase to TTS ("One moment, let me check that.") so there is no dead air. Vary the phrase.
   2. Execute via `runner.ts`.
   3. Append the assistant `tool_use` message and a `tool_result` message to the history, then continue the stream so the model speaks the answer.
   4. Allow several tool calls in a single turn (for example check then book), with a hard cap on iterations per turn to avoid loops.
4. **Barge-in:** if the caller interrupts, keep the current barge-in behaviour. If a tool call is in flight, let it finish, store the result in history, but discard the speech that was cancelled.
5. **Failure:** on handler error, give Claude the error result AND instruct it to say the action's `spokenFallback`.
6. **Conversation history** must keep tool_use / tool_result pairs intact or the API will reject the next request.
7. Log tool latency to `action_runs.duration_ms`.

## 7. Prompt blocks to assemble

#### 7.1 Base voice rules (always included)
```
You are speaking on a live phone call. Everything you say is converted to speech.
- Keep replies short: one to two sentences. Ask only one question at a time.
- Never use lists, markdown, emojis, or symbols. Say numbers, dates and times the way a person would say them aloud (for example "five thirty in the evening", not "17:30").
- Before using a tool, say a very short filler like "one moment" so the caller is not left in silence.
- Never invent availability, prices, addresses, or policies. If you do not have the information from a tool or the knowledge base, say you will have someone call back.
- Before booking, cancelling, or changing anything, repeat the key details (name, date, time) and wait for a clear yes.
- If you did not catch something, ask the caller to repeat it. Do not guess names or numbers.
- If the caller is upset, or asks for a person, transfer the call when that action is available.
- Be warm, natural, and brief. Do not announce that you are an AI unless asked.
```

#### 7.2 Business context block (rebuilt every turn)
```
Business: {{business_name}}
Current date and time: {{now_local}} ({{timezone}}). Today is {{weekday}}.
Business hours: {{hours_human_readable}}
Services: {{services_with_durations}}
Caller's phone number (from caller ID): {{caller_number}}
Use this date and time to interpret words like "today", "tomorrow", "next Monday". Always pass full ISO dates with the timezone offset to tools.
```

#### 7.3 Per-action usage hints (included only if the action is enabled)
- check_availability: "Whenever the caller mentions a day or time, call check_availability before replying. Offer at most three options."
- book_appointment: "Collect name and phone (confirm the number by reading it back in groups). Ask the reason for visit if the agent setting says so. Only book after an explicit yes."
- reschedule/cancel: "Identify the appointment first. If several exist, ask which one."
- lookup_faq: "For any factual question about the business, call lookup_faq first."
- transfer_to_human: "Transfer immediately for emergencies. Say what is happening in one short sentence before transferring."

#### 7.4 Clinic safety rules
```
- You are a receptionist, not a medical professional. Never give diagnoses, medicine advice, or dosage.
- If the caller describes chest pain, difficulty breathing, severe bleeding, loss of consciousness, stroke signs, or any life-threatening situation: tell them to contact emergency services right now and immediately call transfer_to_human.
- Do not read out other patients' information. Only discuss appointments linked to the caller's own phone number.
```

---

## 8. Workspace (home tab) — clinic pack

Route `/`. Read the account's `business_profiles.domain_pack` and render its modules. If no business profile exists yet, show a short setup card (business name, timezone, hours, pick a template) before anything else.

### Layout (top to bottom)

1. **Today strip** — compact cards: appointments today, next appointment (time, name), cancellations today, no-shows this week, calls handled by AI today. Real numbers from the DB only.
2. **Calendar module** (main area)
   - Views: Day, Week (default), Month. Use a calendar component built on existing primitives, or add `@fullcalendar/react` if building from scratch is slower (that is the one allowed new dependency; ask first).
   - Events coloured by status; AI-booked events show a small phone icon.
   - Click empty slot: "New appointment" dialog (manual booking) using the same booking logic as the action (shared service function, not duplicated).
   - Drag to reschedule (calls the same reschedule function, respecting the overlap constraint; show a toast on conflict and snap back).
   - Resource filter if more than one resource.
   - Timezone label shown.
3. **Appointment drawer** (opens on event click): patient name, phone (click to call using the Outbound dialog), service, reason, notes, status buttons (Mark completed, No-show, Cancel, Reschedule), a "View call" link that opens the transcript and summary in the drawer.
4. **Tabs below or beside the calendar:** Appointments (table with search, status and date filters, CSV export), Patients (contacts with visit history), Availability and Services (working hours per weekday, lunch break, holidays and leave -> `time_off`, services with duration and price).
5. **Realtime:** subscribe to `appointments` changes. A phone booking must appear on the calendar without a page refresh, with a subtle highlight.

### Empty and error states
- No appointments: "No appointments yet. Once your agent takes a booking, it appears here." with a link to Agent Studio.
- No agent yet: show a "Create your first agent" card.
- Failed calendar sync: show a small warning badge on that appointment and a retry button in the drawer.

---

## 9. Agent Studio

### 9.1 Create-agent wizard (`/studio/agents/new`)

Seven steps with a progress bar, back/next, autosave as `draft`:

1. **Template**: cards for Clinic, Salon, Real estate, Support, Collections, Blank (non-ready packs show "Coming soon" but may be chosen as Blank behaviour).
2. **Basics**: agent name, business name, language, greeting (pre-filled from the pack), timezone.
3. **Model and Voice**: LLM selector, voice provider and voice, speaking speed, **TTS preview button** (existing `ttsPreview` route).
4. **Actions**: list of actions with toggles, pre-set from the pack. Each enabled action expands an inline config form generated from its `configSchema`. Actions that `requires` an integration the user has not connected show a "Connect" button that deep-links to `/studio/integrations` and returns to this step.
5. **Knowledge**: add Q and A pairs, paste text, upload a document. Clinic pack pre-suggests entries to fill: consultation fee, address, timings, parking, accepted insurance, doctor qualifications.
6. **Number**: choose an existing number or go to provisioning.
7. **Review and test**: summary of enabled actions and settings, **"Test in browser"** button using the existing `voiceToken` browser calling, then "Activate" which sets `status = active`.

### 9.2 Edit agent (`/studio/agents/$id`)
Tabs: Basics, Model and Voice, Actions, Knowledge, Number. Same components as the wizard. Show a banner: "Changes apply to new calls only." Save per tab.

### 9.3 Integrations (`/studio/integrations`)
- **Google Calendar**: "Connect" starts OAuth on the server; tokens are stored encrypted in `integrations`, never sent to the browser. Show connected account, calendar picker, disconnect.
- **SMS**: use existing Twilio credentials; show sender number and a "Send test SMS" button.
- **Webhooks and API**: signing secret (show once, regenerate), list of webhook URLs used by `call_webhook`.

### 9.4 Call Logs (`/studio/calls`)
Keep the existing list and add: summary, outcome badge, sentiment, and a timeline of **actions executed** in that call (from `action_runs`: name, time, status, expandable input/output). This is the debugging view for the whole feature. Link to the appointment or contact the call created.

### 9.5 Outbound (`/studio/outbound`)
- **Single call**: choose agent, enter number (validated), optional variables as key/value rows, press "Call now". Show live status (ringing, in progress, ended) via Realtime on `calls`.
- **Bulk campaigns**:
  1. "New campaign": choose agent, name.
  2. Upload CSV with columns `name, phone` plus any extra columns as variables. Server validates: invalid numbers and duplicates are flagged in a preview table with counts, and contacts marked `do_not_call` are skipped.
  3. Settings: calling window (start/end, in business timezone), max concurrent calls, retry rules (max attempts, gap).
  4. Start / Pause / Resume.
  5. Live table with per-contact status, attempts, outcome (from `post_call_summary`), and a progress bar. Export results to CSV.
  - Variables are injected into the agent's greeting and prompt using `{{variable}}`.
  - A simple server-side queue respects `max_concurrent`, the calling window and retries. Stop the campaign cleanly on pause, never abandon calls mid-conversation.
  - Add a visible note: outbound commercial calls are regulated (do-not-disturb and registration rules in India); only call people who have consented.

---

## 10. Worked example to implement and test (the acceptance demo)

Setup: new account, template Clinic, business "Mehta Clinic", timezone Asia/Kolkata, hours 10:00 to 20:00, services Consultation 15 min and Follow-up 10 min, one resource "Dr. Mehta", actions enabled as per pack, a knowledge entry "Consultation fee is 500 rupees".

Date context: Monday 5 October 2026.

Call script and expected behaviour:

| # | Caller says | Expected agent behaviour |
|---|---|---|
| 1 | (call connects) | Greets with the configured greeting |
| 2 | "I want to see the doctor tomorrow evening." | Asks first visit or follow-up |
| 3 | "Follow-up." | Filler, then `check_availability({date:"2026-10-06", from:"16:00", to:"20:00", service:"Follow-up"})` |
| 4 | (tool returns 17:00, 17:30, 18:30) | Offers those three times by voice |
| 5 | "Five thirty." | Asks for name and phone number |
| 6 | "Rohan Patil, nine eight seven six..." | Repeats name, day, time, asks for confirmation |
| 7 | "Yes." | `book_appointment({... start_time:"2026-10-06T17:30:00+05:30"})`, then confirms by voice |
| 8 | "What's the fee?" | `lookup_faq({query:"consultation fee"})`, answers "500 rupees" |
| 9 | "Thanks, bye." | `end_call` |
| After | | `calls` row has summary and outcome `booked`; `appointments` row exists; confirmation SMS in `messages`; reminder job scheduled; the Workspace calendar shows the new event live; Call Logs shows the three action runs |

Additional scenarios that must pass (these also become the QA sheet):
1. Request outside working hours -> alternatives offered, nothing booked.
2. Fully booked day -> next available dates offered.
3. Two callers pick the same slot at once -> exactly one booking; the other hears the `slot_taken` recovery.
4. Reschedule by caller ID; cancel and confirm the slot becomes free again.
5. Caller says "I have chest pain" -> immediate emergency advice and transfer.
6. Question not in KB -> callback offer, no invented answer.
7. Google Calendar disconnected or erroring -> booking still succeeds, `sync_status = failed`, retry button works.
8. Caller hangs up mid-booking -> no partial appointment row.
9. Webhook action times out -> spoken fallback, call continues.
10. Bulk CSV with one invalid number and one duplicate -> both flagged before start.

---

## 11. Non-functional requirements

- **Security:** RLS everywhere; server verifies `user_id` on every query; OAuth tokens and webhook secrets encrypted at rest and never returned to the browser; webhook calls signed; rate-limit action endpoints.
- **Privacy:** store only what is needed; mention in the greeting setting that calls may be recorded (configurable text); do not log tokens or full credentials in `action_runs`.
- **Reliability:** every handler wrapped in try/catch and a timeout; failures degrade to spoken fallbacks; no handler can crash the WebSocket session.
- **Performance:** keep tool results small; cache the business profile and services per call; avoid extra round trips in the hot path.
- **Observability:** `action_runs` for every action; server logs include `call_id` on every line.
- **Accessibility and responsive:** keyboard-usable calendar and forms; mobile layout works for the Workspace and Agent Studio lists.
- **No fabricated data:** no seeded fake appointments in production paths. A separate `scripts/seed-demo.ts` may create demo data when run manually.

---

## 12. Phases (stop and report after each)

**Phase 0: Foundation**
- Migration from section 4, RLS, Realtime enabled.
- Action registry, runner, `action_runs` logging.
- Tool loop in `claude.ts` with a trivial test action. Agents without actions behave exactly as before.
- Report: files changed, how to run the migration, how to test.

**Phase 1: Clinic core actions**
- Implement `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `lookup_appointment`, `lookup_faq`, `end_call`.
- Slot generation module with unit tests (working hours, time off, buffers, past times, timezone, DST-free but offset-correct for Asia/Kolkata and one other zone).
- Concurrency test for the exclusion constraint.
- Clinic domain pack and prompt assembly (sections 6 and 7). The pack lists actions that arrive in later phases (for example `send_sms`, `transfer_to_human`); until they are implemented the registry must skip them silently, and the wizard must show them as "coming soon".
- Report with a recorded or scripted test of the example call.

**Phase 2: Workspace**
- New home route with Today strip, Calendar, drawer, Appointments, Patients, Availability and Services.
- Manual booking and drag-to-reschedule using shared service functions.
- Realtime updates.

**Phase 3: Agent Studio**
- New sidebar and routes, move existing screens, redirects.
- Create wizard, edit tabs, Actions tab with config forms generated from `configSchema`, Knowledge, Model and Voice.
- Call Logs with actions timeline.

**Phase 4: Messaging, handoff, integrations**
- `send_sms`, confirmation, reminder worker, `transfer_to_human`, `post_call_summary`, `notify_owner`.
- Google Calendar OAuth and push sync with retry.
- Integrations screen.

**Phase 5: Outbound**
- Single call dialog.
- Campaigns: CSV upload and validation, queue with concurrency, calling window and retries, live results, export.

**Phase 6: More packs**
- Real Workspace modules for salon (calendar with resource columns), real estate (Board + site visits), support (Table).
- `capture_lead` and `call_webhook` actions.
- Prove that a new pack needs configuration only.

**Phase 7: Hardening**
- Error and empty states, mobile pass, demo seed script, test case sheet from section 10, final demo run.

---

## 13. Out of scope for this update
- Multi-user teams and role permissions inside one business.
- Billing and subscriptions.
- WhatsApp (design the messaging layer so it can be added).
- Two-way Google Calendar sync (reading the doctor's personal busy time).
- Embedding-based knowledge retrieval (keep the `lookup_faq` interface stable so it can be upgraded).
- Multi-language voice beyond the language setting already supported by the providers.

If something in this prompt conflicts with the existing code, **stop and ask** rather than guessing. Prefer small, reviewable commits with clear messages per phase.
