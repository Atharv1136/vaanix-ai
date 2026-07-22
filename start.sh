#!/bin/sh
set -e

echo "[start] Starting internal Nitro SSR server on port 3001..."
PORT=3001 NODE_ENV=production node .output/server/index.mjs &
NITRO_PID=$!

sleep 2

echo "[start] Starting primary Express + WebSocket server on port ${PORT:-3000}..."
NODE_ENV=production PORT=${PORT:-3000} npx tsx src/server/index.ts &
EXPRESS_PID=$!

wait $NITRO_PID $EXPRESS_PID
