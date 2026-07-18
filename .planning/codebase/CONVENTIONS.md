# Coding Conventions

**Analysis Date:** 2026-07-18

## Naming Patterns

- **UI Components:** PascalCase (`Settings.tsx`, `TranscriptPanel.tsx`).
- **Hooks:** prefix with `use` (`useQuery`, `useMutation`).
- **Styles:** Tailwind classes combined with utility-first layouts.

## Code Style

- **Prettier:** Code is styled automatically on format/commit via Prettier.
- **ESLint:** Code lints against project rules using `eslint.config.js`.

## Error Handling

- Frontend operations catch API errors gracefully and report them via `sonner` toasts.
- Backend server operations (Twilio, ElevenLabs, Claude calls) must use try/catch blocks. If a live API fails mid-call, the server must redirect the call to the line's configured forwarding staff number (`forward_to`) to prevent silent call drops.

---
*Conventions analysis: 2026-07-18*
