#!/bin/sh
set -e

echo "[start] Starting Express + WebSocket server on port ${PORT:-3000}..."
exec npx tsx src/server/index.ts
