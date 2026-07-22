# Vaanix AI — Common Issues & Solutions Guide (`issues.md`)

This document serves as an exhaustive knowledge base for diagnosing and resolving recurring technical issues in the Vaanix AI Assistant platform.

---

## Table of Contents
1. [Issue 1: Calls Automatically Disconnecting / Ending Immediately](#issue-1-calls-automatically-disconnecting--ending-immediately)
2. [Issue 2: "Node.js detected but native WebSocket not found" Error](#issue-2-nodejs-detected-but-native-websocket-not-found-error)
3. [Issue 3: "This page didn't load" Dashboard / Route Crashes](#issue-3-this-page-didnt-load-dashboard--route-crashes)
4. [Issue 4: Inbound Calls Saying "Line Not In Service"](#issue-4-inbound-calls-saying-line-not-in-service)
5. [Issue 5: Outbound Call Failures & Twilio Credentials](#issue-5-outbound-call-failures--twilio-credentials)

---

## Issue 1: Calls Automatically Disconnecting / Ending Immediately

### Symptom
When an inbound or outbound call connects, the call drops or hangs up after 1–2 seconds before the AI finishes speaking or receiving user audio.

### Root Causes
1. **TTS Provider Failures**: If ElevenLabs or Deepgram API keys were missing, expired, or rate-limited, an unhandled exception was thrown during audio synthesis. This triggered `handleFailover()`, which executed `ws.close()`, disconnecting Twilio instantly.
2. **Unassigned Inbound Line**: Twilio voice webhook received an incoming call to a number with no assigned `assistant_id`, returning a hangup TwiML instead of routing to an agent.
3. **Turn Error Cascading**: Temporary network glitches during LLM streaming caused the WebSocket handler to close the entire call connection instead of recovering.

### Permanent Fixes & Solutions
- **Multi-Tier Free TTS Fallback**: Updated `getElevenLabsVoiceStream` in `src/server/elevenlabs.ts` to include Microsoft Edge TTS (`en-US-JennyNeural`, `hi-IN-SwaraNeural`) as an ultimate free fallback that requires no API keys and never fails.
- **Non-Fatal Turn Errors**: Modified `src/server/mediaStream/handler.ts` so turn errors log diagnostic warnings without calling `cleanup()` or `ws.close()`. The call stays alive and connected.
- **Global Default Agent**: Implemented `getDefaultAssistantId()` in `src/server/supabase.ts` and updated `src/server/routes/twilioWebhook.ts` so all unassigned lines automatically answer using the Default Agent.

---

## Issue 2: "Node.js detected but native WebSocket not found" Error

### Symptom
Clicking "Start Autonomous Call" in the dashboard produces a red notification toast:
> `Call failed: Node.js detected but native WebSocket not found. Suggested solution: Ensure you are running Node.js 22+ or provide a WebSocket implementation via the transport option.`

### Root Cause
The production Docker container previously used `node:20-slim`. In Node.js 20, global `WebSocket` (`globalThis.WebSocket`) is disabled by default, causing the Twilio SDK to fail when initializing real-time voice sessions.

### Permanent Fixes & Solutions
1. **Upgrade Docker Image to Node 22**: Updated `Dockerfile` builder and runner stages to `FROM node:22-slim`. Node 22 has native, built-in global `WebSocket` support.
2. **Polyfill `globalThis.WebSocket`**: Added explicit WebSocket polyfilling at server entry points (`src/server/index.ts` and `src/server/routes/outbound.ts`):
   ```typescript
   import WebSocket from "ws";
   if (typeof (globalThis as any).WebSocket === "undefined") {
     (globalThis as any).WebSocket = WebSocket;
   }
   ```

---

## Issue 3: "This page didn't load" Dashboard / Route Crashes

### Symptom
Navigating to `/phone-numbers` or other dashboard sections triggers TanStack Router's root error boundary displaying "This page didn't load".

### Root Causes
1. **Radix UI Select Component Constraints**: `@radix-ui/react-select` throws an uncaught JavaScript error when `<Select value="">` or `<SelectItem value="">` is rendered with an empty string (`""`).
2. **Empty Options List**: Rendering `<SelectContent>` with 0 `<SelectItem>` children when lists (like `phoneNumbers` or `assistants`) are empty causes Radix UI internal DOM crashes.
3. **SSR LocalStorage Access**: TanStack Start SSR trying to read `localStorage` or call `supabase.auth.getUser()` on the server side where browser context doesn't exist.
4. **Missing React Hook Imports**: Using React hooks (like `useEffect`) without importing them in the component file.

### Permanent Fixes & Solutions
- **Safe Controlled Values**: Always pass `value={val || undefined}` or default strings (e.g. `value={assistantId || "auto"}`) to `<Select>`.
- **Disabled Option Fallback**: Always include a disabled fallback option inside `<SelectContent>` when option arrays are empty:
  ```tsx
  {phoneNumbers.length === 0 ? (
    <SelectItem value="none" disabled>No phone numbers available</SelectItem>
  ) : ( ... )}
  ```
- **Client-Only Route Flag (`ssr: false`)**: Added `ssr: false` and a localized `errorComponent` on route definitions (e.g., `createFileRoute("/_authenticated/phone-numbers")`) so any component error is caught locally.
- **Hook Imports**: Ensure `import { useState, useEffect } from "react";` is present at the top of all component files.

---

## Issue 4: Inbound Calls Saying "Line Not In Service"

### Symptom
Calling your Twilio phone number results in an automated message: "Sorry, this line is not in service."

### Root Cause
The phone number entry in the database has a `null` `assistant_id`, and no fallback agent was set.

### Permanent Fixes & Solutions
1. Go to the **Phone Numbers** console (`/phone-numbers`).
2. Select your desired assistant in the **Default Call Agent** card at the top.
3. Alternatively, map a specific assistant to the individual phone number in the table dropdown.

---

## Issue 5: Outbound Call Failures & Twilio Credentials

### Symptom
Outbound call fails with toast notification: `"Failed to start call"` or `"Twilio credentials missing"`.

### Root Cause
1. Phone numbers entered without international E.164 country code format (e.g. `9561706020` instead of `+919561706020`).
2. Missing or incorrect Environment Variables on Render.

### Permanent Fixes & Solutions
- **E.164 Format**: Ensure destination numbers include the leading `+` and country code (e.g., `+13186188647` for US, `+919561706020` for India).
- **Environment Variables**: Verify that the following environment variables are correctly set in the Render Dashboard:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
  - `PUBLIC_BASE_URL` (e.g. `https://vaanix-ai.onrender.com`)
