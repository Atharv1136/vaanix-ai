#!/bin/sh
set -e

echo "[start] Starting Express backend on port ${BACKEND_PORT:-3001}..."
BACKEND_PORT=${BACKEND_PORT:-3001} NODE_ENV=production tsx src/server/index.ts &
BACKEND_PID=$!

sleep 2

echo "[start] Starting Nitro SSR server on port ${PORT:-3000}..."
NODE_ENV=production PORT=${PORT:-3000} node .output/server/index.mjs &
NITRO_PID=$!

# Wait for both processes to complete (POSIX compliant, no -n flag)
wait $BACKEND_PID $NITRO_PID
