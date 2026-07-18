## CampusConnect AI — Staff Dashboard (Frontend Build)

Building the Lovable-scope piece (Prompt 1). The backend voice orchestration service (Prompt 2) needs a persistent Node server with Twilio Media Streams and cannot run inside a Lovable project — I'll skip it and note it at the end.

### Scope

Internal staff dashboard for a college admission cell. Auth-gated, single-institution, all staff can read/write.

### Approach

**Backend (Lovable Cloud / Supabase)**
- Enable Lovable Cloud for auth + Postgres + storage.
- Email/password auth only; no public signup route (the `/auth` page shows sign-in only).
- Tables per PRD: `staff`, `kb_sections`, `call_lines`, `calls`, `call_transcripts`, `common_queries`, plus a `settings` singleton (business hours, greeting, org name).
- RLS: authenticated users can read/write everything (single-institution). `service_role` full access.
- Seed realistic demo rows (courses, cutoffs, CAP round dates, sample calls with transcripts, top questions) in the same migration.

**Design system**
- Rewrite `src/styles.css` with the exact palette: primary `#1D4ED8`, amber `#F59E0B`, success `#16A34A`, warning `#DC2626`, bg `#F8FAFC`, card `#FFFFFF`, text `#0F172A` / `#64748B`, radii 10/8, Inter loaded via `<link>` in `__root.tsx`. All values as oklch semantic tokens.
- Framer Motion for subtle fade/slide/stagger only.

**Routes** (TanStack file-based; all protected pages under `_authenticated/`)
```text
/                              → public landing redirecting to /auth or /dashboard
/auth                          → sign-in
/_authenticated/route.tsx      → gate (integration-managed shape)
/_authenticated/dashboard      → stats + recent calls + top unanswered
/_authenticated/knowledge-base → sidebar categories + inline-edit entries + autosave
/_authenticated/call-lines     → grid of line cards with AI toggle
/_authenticated/call-logs      → filter bar + table
/_authenticated/call-logs/$id  → transcript slide-over (as nested route)
/_authenticated/analytics      → ranked question bars
/_authenticated/settings       → staff, business hours, greeting
```
App shell (sidebar nav + header) lives in `_authenticated/route.tsx` around `<Outlet />`.

**Key interactions**
- Autosave-on-blur in KB editor with "Saved" indicator.
- Optimistic flag toggle on transcripts propagates to logs/dashboard via query invalidation.
- AI-off toggle prompts confirm only during business hours.
- Realistic seed data (no lorem ipsum).

**Head metadata**
- Real `<title>` "CampusConnect AI — Admission Cell Console" and matching og/twitter tags in `__root.tsx`.
- `sitemap.xml` + `robots.txt` (disallow, since internal tool).

### Out of scope (explicitly)

- The Twilio + Deepgram + Claude + ElevenLabs voice orchestration server (Prompt 2). Lovable can't host a persistent WebSocket/Media Streams process. The dashboard's `call_lines.ai_enabled` toggle, `kb_sections`, and log tables are the contract; a separate Node service reads/writes them.
- "Preview as audio" button in Settings is a placeholder (no TTS wired).
- Live call auto-refresh uses Supabase realtime on `calls`/`call_transcripts`.

### Deliverables in this build

Design tokens → Cloud enable + migration + seed → auth page → app shell + protected layout → all 7 dashboard pages → sitemap/robots/head → verify build.

Confirm to proceed and I'll implement.
