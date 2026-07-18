# Testing Patterns

**Analysis Date:** 2026-07-18

## Test Framework

- Currently, no unit tests or E2E tests are configured in `package.json`.
- Testing is performed manually by verifying UI layouts locally and inspecting API triggers.

## Future Testing Scope

- **Integration Tests:** Wire mock test frameworks for voice streams (e.g. sending mock websocket media streams to test STT-LLM-TTS loops).
- **Frontend Testing:** Verify route redirects and state invalidations with TanStack Start configurations.

---
*Testing analysis: 2026-07-18*
