# Discussion Log: Voice Streaming Pipeline

**Date:** 2026-07-18
**Phase:** 1 (Voice Streaming Pipeline)

## Decisions Logged

1. **Framework & Port Sharing**:
   - Option Chosen: Express + Node.js `ws` library (Option 1).
   - Reason: Standard runtime compatibility, easy port sharing, no extra native build steps.

2. **Audio Processing**:
   - Option Chosen: Raw buffer accumulation (Option 1).
   - Reason: Keeps deployment server lightweight, avoids native `ffmpeg` dependencies.

3. **Ignorance Policy**:
   - Option Chosen: Graceful Ignorance + Transfer to staff (Option 1).
   - Reason: High-quality service response, ensures user gets help if the AI model lacks info.

4. **Failover Protocol**:
   - Option Chosen: Transfer to staff `forward_to` desk number on errors (Option 1).
   - Reason: Robust user experience, fail-safe backup.

---
*Created automatically after discuss phase*
