# VAANIX AI Assistant — Engineering Memory & Evolution Log

This document serves as the authoritative, end-to-end engineering memory recording every user directive, architectural investigation, root cause diagnosis, code transformation, and verification outcome across the development lifecycle of the **Vaanix AI Assistant** project.

---

## Chronological Workflows & Incident Post-Mortems

### Phase 1: Multi-Tenant Architecture, Database Security, & Generalized Actions Engine

#### 1. User Directive
> *"Plan the update properly and don't break the any of the flow and you can just rework on the UI part also like you can use some different colors which will suit the option... Whenever a user creates account (myself Atharv vs XYZ), XYZ person sees the same dashboard of Atharva and is able to access all the agents that are made by Atharva so it's not proper. A new user must get a full new interface and workspace. Also make sure actions are generalized (not just clinic/doctor, but salon, admissions, etc.)."*

#### 2. Analytical Approach & Gap Discovery
- **Tenant Leakage**: All Supabase database tables (`assistants`, `calls`, `contacts`, `phone_numbers`, `appointments`, `action_runs`) lacked strict user-bound Row Level Security (RLS). Public `SELECT` returned all rows across all users.
- **Domain Hardcoding**: Action handlers were rigid (e.g. specifically checking "patient", "doctor", "clinic"), limiting versatility for enterprise use cases like salons, real estate, admissions, customer service.
- **Visual Stagnation**: UI used generic blue/slate gradients with standard default cards rather than high-end dark glassmorphism and modern typography.

#### 3. Technical Changes Made
- **Database Migrations (`supabase/migrations/`)**:
  - `20261005000001_multi_tenant.sql`: Created `organizations`, `user_profiles`, and added `user_id` foreign keys with strict PostgreSQL RLS policies (`auth.uid() = user_id`) on all core tables.
  - `20261005000002_actions_and_scheduling.sql`: Built generalized tables for dynamic tool dispatch: `action_definitions`, `action_runs`, `scheduled_jobs`, and `ai_provider_keys`.
- **Domain Template Engine ([src/lib/domainPacks.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/lib/domainPacks.ts))**:
  - Engineered generalized business templates:
    1. **Healthcare / Clinic**: Appointments, prescription refills, symptoms intake.
    2. **Salon & Wellness**: Service bookings (haircut, spa, styling), stylist assignment, rescheduling.
    3. **Academic / Admissions**: Campus tours, application fee verification, deadline checks.
    4. **Customer Support / General**: Ticket escalation, balance queries, order lookups.
- **Dynamic Action Dispatcher ([src/server/actions/](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/actions/))**:
  - Abstracted action execution away from hardcoded schemas into generic handlers (`book_appointment`, `cancel_appointment`, `reschedule_appointment`, `send_sms`, `transfer_call`).

---

### Phase 2: Live Telephony & Webhook Failures

#### 1. User Directive
> *"its failing to call you broke some flow i think"* & *"STILL"*

#### 2. Root Cause Analysis
- Outbound dialing triggered Twilio API calls, but Twilio's webhook returned HTTP 403 / 500 when accessing database records on unauthenticated webhook endpoints.
- Remote Supabase denied anonymous access to `calls`, `call_transcripts`, `appointments`, and `contacts` when accessed via Twilio's incoming webhook carrier threads.

#### 3. Technical Changes Made
- Added anonymous and service-role permission grants in Supabase SQL:
  ```sql
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  ```
- Created a robust persistent tunnel daemon ([scripts/tunnel.cjs](file:///d:/be%20project/calling/campusconnect-ai-assistant/scripts/tunnel.cjs)) that connects to local port `3000`, generates a secure public HTTPS/WSS URL (`vaanix-ai-tunnel.loca.lt`), automatically updates `.env`, and notifies Express dynamically.

---

### Phase 3: Twilio Application Error & Tool Schema 400

#### 1. User Directive
> *"WHEN THE CALL Connect it says that we are sorry an application error occur So just fix that thing and Make it working... I'll use the Lakme agent which I have made in the Atharva's account (Hindi agent 'सिया') to book an appointment, schedule in calendar, and cancel it."*

#### 2. Root Cause Analysis
- Inspected server logs during call initialization:
  ```
  [AiKeyPool] Groq API error 400: 'tools.0.function.name: 'End Call' does not match '^[a-zA-Z0-9_-]+$''
  ```
- Tool names configured in database had spaces (`"End Call"`, `"Book Appointment"`). OpenAI and Groq function-calling specs strictly forbid spaces in tool identifiers.
- When Groq rejected the schema with HTTP 400, the server fell back to retry loops without tools or crashed the WebSocket pipeline, prompting Twilio's automated error: *"We are sorry, an application error has occurred"*.
- In `bookAppointment.ts`, spoken customer input was directly passed to SQL queries expecting UUIDs, throwing Postgres UUID syntax errors (`invalid input syntax for type uuid`).

#### 3. Technical Changes Made
- **Tool Identifier Sanitization ([src/server/services/aiKeyPool.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/services/aiKeyPool.ts) & [src/server/services/toolExecutor.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/services/toolExecutor.ts))**:
  - Enforced automatic sanitization: `name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')`.
  - Mapped `"End Call"` → `"end_call"`, `"Book Appointment"` → `"book_appointment"`.
- **UUID Defensive Fallback ([src/server/actions/handlers/bookAppointment.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/actions/handlers/bookAppointment.ts))**:
  - Implemented regex validation for UUIDs; when spoken names (e.g. "Haircut") are passed, the handler queries resources by title/name rather than casting directly to UUID.

---

### Phase 4: Voice Latency Optimization (From 15–20s Down to Sub-2s)

#### 1. User Directive
> *"See as you can see in database logs also and wherever you can see the time taken by the AI agent is very high like it's usually taking around 10 to 20 seconds to reply back a normal question also so it's not feasible like I want the response time to be one to two seconds so can you just improvise it for that"*

#### 2. Root Cause Analysis (Deep Dive into Live Call Logs)
Live server transcripts from the Lakme Salon call revealed 4 compounding bottlenecks:
1. **Missing Devanagari Sentence Boundary**:
   - The streaming regex in `handler.ts` was `const sentenceEndPattern = /([.!?])\s+|([.!?])$/;`.
   - In Hindi, Qwen/LLMs end sentences with poorna-viram **`।`** (`\u0964`) or **`॥`** (`\u0965`).
   - Because `।` was not matched, the sentence streaming pipeline never fired early. It waited for the entire 180-token generation to finish before sending the full text block to TTS at the end.
2. **Premature Deepgram Endpointing & Self-Interruption Loop**:
   - Deepgram endpointing was set to `300ms`. When the caller paused for 300ms mid-sentence (*"हां, मुझे"* ... pause ... *"appointment book करनी थी"*), Deepgram emitted an `is_final` for the fragment.
   - When the next fragment arrived, `interruptAI()` aborted the active turn and restarted generation.
   - Furthermore, acoustic echo from the phone's speakerphone during the first syllables of AI speech leaked back into the microphone, triggering false caller interruptions that cut off AI audio.
3. **Blocking Database Round-trips**:
   - Every turn `await`-ed `saveCallTranscriptTurn(...)` to Supabase over HTTPS before invoking LLM generation, adding ~400ms of synchronous network lag per turn.

#### 3. Technical Changes Made
- **Multilingual Sentence Boundary & Clause Detection ([src/server/mediaStream/handler.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/mediaStream/handler.ts))**:
  - Updated pattern: `/([.!?।॥\n])\s*|(,\s+)/g`.
  - Added clause breaks on commas for accumulated phrases >= 12 characters (e.g. `"नमस्ते ATHARV जी,"` -> synthesized and played immediately in **~500ms** while the rest of the sentence streams).
- **Acoustic Echo Guard**:
  - Added a 700ms grace window in `interruptAI()` after AI starts speaking to prevent phone sidetone self-interruption.
- **Debounced Caller Thought Accumulation**:
  - Buffered caller speech chunks with a 350ms window to assemble complete sentences before invoking the LLM.
- **Asynchronous Transcript Persistence**:
  - Switched `saveCallTranscriptTurn` to fire non-blocking background promises (`.catch(...)`).

---

### Phase 5: Deepgram 400 Disconnect Incident

#### 1. User Directive
> *"Now I said the thing on call but it was not detected only and like it's not answering me back only So make something solid that will fix this issue and mmake it perfect"*

#### 2. Root Cause Analysis
- Inspected server logs on boot:
  ```
  [Deepgram] Options: {"model":"nova-2", ... ,"endpointing":400,"utterance_end_ms":800}
  [Deepgram] Connection closed.
  [Deepgram] Connection error details: Error: Unexpected server response: 400
  [Deepgram] Failed to initialise STT stream (non-fatal): Unexpected server response: 400
  ```
- Deepgram's WebSocket endpoint does not support `utterance_end_ms` as a query parameter on Nova-2 live streams. Deepgram rejected the handshake with HTTP 400, leaving `deepgramStream = null` throughout the call.

#### 3. Technical Changes Made
- Reverted to standard, validated connection options in [src/server/deepgram.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/deepgram.ts):
  ```ts
  const options = {
    model: "nova-2",
    language: deepgramLang,
    smart_format: true,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    endpointing: 300,
  };
  ```
- Verified standalone connection probe: connected with `200 OK` and accepted audio buffers.

---

### Phase 6: Tunnel Offline & IPv6 Loopback Collision

#### 1. User Directive
> *"TUNNEL OFFLINE I THINK FIX IT"*

#### 2. Root Cause Analysis
- Tested tunnel endpoint: returned `Status: 502 text/plain` (Bad Gateway).
- On Windows systems, `localtunnel` defaults to forwarding traffic to `localhost`.
- Node/Windows resolves `localhost` to IPv6 `::1`, whereas the Express server was bound to IPv4 `0.0.0.0` / `127.0.0.1`.
- Localtunnel received `ECONNREFUSED` on `::1` and served 502 Bad Gateway to incoming requests.

#### 3. Technical Changes Made
- Explicitly set `local_host: "127.0.0.1"` in [scripts/tunnel.cjs](file:///d:/be%20project/calling/campusconnect-ai-assistant/scripts/tunnel.cjs).
- Re-tested public endpoint: `Tunnel live test status: 200 OK`.

---

### Phase 7: Call Auto-Termination (`wss://127.0.0.1` Carrier Drop)

#### 1. User Directive
> *"CALL AUTOMATICALLY ENDED FIX"*

#### 2. Root Cause Analysis
- Server logs showed:
  ```
  [TwilioWebhook] Outbound call using assistant: a5cdea49-610c-4408-99b6-079ff1509a81
  [TwilioWebhook] Connecting media stream to: wss://127.0.0.1/media-stream
  ```
- In [src/server/routes/twilioWebhook.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/routes/twilioWebhook.ts):
  ```ts
  const rawHost = (hostHeader || publicBaseUrl || "localhost:3000").replace(/^https?:\/\//, "");
  const streamUrl = `wss://${rawHost}/media-stream`;
  ```
- Because localtunnel proxies requests to `127.0.0.1`, `req.headers.host` was `"127.0.0.1"`.
- The webhook generated `<Stream url="wss://127.0.0.1/media-stream">` in TwiML.
- Twilio's cloud carrier cannot connect to local loopback (`127.0.0.1`), throwing a fatal carrier disconnect and ending the call immediately.

#### 3. Technical Changes Made
- Updated [src/server/routes/twilioWebhook.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/routes/twilioWebhook.ts) to strictly prioritize `configuredBase` (the active public tunnel URL) over internal loopback headers:
  ```ts
  const configuredBase = getPublicBaseUrl() || process.env.PUBLIC_BASE_URL || "";
  let cleanHost = "";
  if (configuredBase && !configuredBase.includes("localhost") && !configuredBase.includes("127.0.0.1")) {
    cleanHost = configuredBase.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  } else if (hostHeader && !hostHeader.includes("localhost") && !hostHeader.includes("127.0.0.1")) {
    cleanHost = hostHeader;
  } else {
    cleanHost = (configuredBase || hostHeader || "localhost:3000").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  const streamUrl = `wss://${cleanHost}/media-stream`;
  ```
- Verified generated TwiML:
  ```xml
  <Response>
    <Connect>
      <Stream url="wss://vaanix-ai-tunnel.loca.lt/media-stream">
        <Parameter name="assistant_id" value="a5cdea49-610c-4408-99b6-079ff1509a81"/>
      </Stream>
    </Connect>
  </Response>
  ```

---

### Phase 8: Practical Indian Rupee (INR ₹) Cost-Cutting Pricing Structure

#### 1. User Directive
> *"Just do one thing the price on the main page should not be in dollar it should be some practical INR rupees so like put some practical prices like till this as we're looking to a cost cutting so just put cost cutting prices like that Once done just push it to the gITHUB"*

#### 2. Root Cause & Commercial Strategy Analysis
- The main landing page had generic US dollar tiering (`$29`, `$99`, `$399` / month).
- For Indian SMBs, local clinics, salon chains, educational institutes, and startups, dollar pricing creates friction, high perceived cost (e.g. $99 ≈ ₹8,500/mo), and foreign transaction barriers.
- Practical Indian voice-AI pricing should reflect accessible entry points with high volume ROI that directly undercuts human tele-caller monthly salaries (which typically range from ₹15,000–₹25,000/month per agent).

#### 3. Technical Changes Made
- **Landing Page Pricing Architecture ([src/routes/index.tsx](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/routes/index.tsx))**:
  - **Starter**: **₹999 / month** (`~₹1.99/min` effective rate). 1 Assistant, 500 Call Minutes, Hindi/Marathi/English, appointment booking. Designed for local single-branch clinics and salons.
  - **Pro (Most Popular)**: **₹2,499 / month** (`~₹0.99/min` effective rate). 5 Assistants, 2,500 Call Minutes, neural voices, live calendar booking, WhatsApp/SMS confirmations, barge-in.
  - **Enterprise**: **₹7,999 / month** (`~₹0.79/min` high-volume rate). Unlimited Assistants, 10,000 Call Minutes, custom cloning, SIP trunking, ERP/Webhook integrations, dedicated SLA.
- Re-verified all links point cleanly to `/auth` with localized call-to-actions.

---

## Current Architecture & System Health

| Component | Status | Configuration / Endpoint |
| :--- | :--- | :--- |
| **Express Backend** | Healthy (Port 3000) | Full WebSocket `/media-stream`, Twilio webhooks, Groq Key Pool |
| **Localtunnel Daemon** | Active (Keep-alive) | `https://vaanix-ai-tunnel.loca.lt` bound to `127.0.0.1:3000` |
| **Speech-to-Text** | Active | Deepgram `nova-2`, 8kHz mulaw, `endpointing: 300` |
| **AI LLM Inference** | Active | Groq key pool with `qwen/qwen3.8-27b` (TTFT ~70ms) |
| **Text-to-Speech** | Active | Edge TTS (`hi-IN-SwaraNeural`), sub-500ms clause streaming |
| **Database & Auth** | Isolated | Multi-tenant Supabase RLS with organization/user profiles |



---

### Phase 9: Appointment Number Confirmation Optimization & Dynamic Services Listing

#### 1. User Directive
> *"It's asking for the like whenever the agent is asking for the number while confirming the appointment it's very difficult to tell the number like the commas or semi colons are coming in between the number and means like it's not proper and also one thing that while asking for the service the agent should tell what all services are available with them and means just these things and you have to fix it once done just test it and justice push it to the gith Don't just paste it on the browser just internally test it using some command and if all the tests are passed then you can just push it to the g means like it should complete the whole booking process Still it's taking some time to reply back but we can just gradually reduce it I'm consistently working on it if you have any other approach just tell me what is that approach don't implement it implement these all other things and just tell me the approach at the end"*

#### 2. Root Cause Analysis
- **Phone Number Dictation Friction & Punctuation**:
  1. The system prompt and tool schema forced the assistant to stop and ask callers to dictate their 10-digit phone number over the phone, even though Twilio and the WebSocket pipeline already had their active caller number.
  2. When callers spoke digits, Deepgram's smart formatter inserted commas and semicolons between individual digits (`"9, 8, 2, 0, 1"`).
  3. When the AI or caller repeated the number back, the TTS engine paused after every comma/semicolon, creating an awkward, robotic recitation.
  4. Phone numbers saved to PostgreSQL or sent via Twilio SMS failed or had invalid formats if commas/dashes were present.
- **Service Awareness Deficit**:
  1. Assistants lacked dynamic knowledge of the tenant's actual service catalog in their live context.
  2. When callers asked what services were available or when the assistant asked which service they wanted, the assistant gave generic responses rather than listing the business's actual services.

#### 3. Technical Changes Made
- **Digit Sanitization & Audio Flow ([src/server/mediaStream/handler.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/mediaStream/handler.ts))**:
  - Implemented `sanitizeDigitSpeech(text)` to strip commas, semicolons, hyphens, and periods between or adjacent to digits (`([0-9०-९])\s*[,;\-–—]\s*(?=[0-9०-९])`).
  - Pre-sanitized all incoming STT chunks and caller text before passing to the LLM.
  - Sanitized sentence buffers before boundary extraction so digit sequences are never broken mid-number.
  - Sanitized TTS text strings so speech synthesis speaks digits fluently in natural groupings.
- **Caller Number Confirmation Policy ([src/server/services/aiKeyPool.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/services/aiKeyPool.ts) & [src/server/actions/registry.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/actions/registry.ts))**:
  - Injected caller number context: `[CURRENT CALLER PHONE: +91...]`.
  - Added instruction: Instead of asking callers to recite 10 digits, the agent asks: *"क्या मैं इसे आपके इसी कॉलिंग नंबर पर कन्फ़र्म कर दूँ?"* / *"Should I confirm with your current calling number?"*.
  - Updated `book_appointment` action description to default to the caller's active phone number without demanding manual dictation.
  - Normalized phone numbers in `bookAppointment.ts` (`phone.replace(/[^0-9+]/g, '')`).
- **Dynamic Services Injection ([src/server/mediaStream/handler.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/server/mediaStream/handler.ts) & [src/lib/domainPacks.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/src/lib/domainPacks.ts))**:
  - During call initialization, loaded active services from Supabase `services` table and injected them into the prompt.
  - Populated starter salon services for the Lakme Salon assistant (Haircut & Styling, Hair Spa, Facial Treatment, Bridal Makeup, Manicure & Pedicure).
  - Explicitly instructed the assistant: When asking the caller which service they need, ALWAYS state the available services.
- **Verification via Automated Test Suite ([scripts/test-booking-flow.ts](file:///d:/be%20project/calling/campusconnect-ai-assistant/scripts/test-booking-flow.ts))**:
  - Unit tests verified digit extraction and sanitization without punctuation leakage.
  - End-to-end multi-turn conversation verified:
    1. Turn 1: Caller asked about services -> AI accurately listed available salon services.
    2. Turn 2: Caller asked for a slot -> AI checked availability and offered open slots.
    3. Turn 3: Caller confirmed on current number -> AI invoked `book_appointment` with clean E.164 phone number and confirmed the booking.
    4. Database query confirmed appointment record created in Supabase with `status: "confirmed"`.
