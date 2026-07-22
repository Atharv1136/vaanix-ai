#!/bin/sh
# start.sh — Production startup script for Render
# Runs both the Express backend (port 3001) and the nitro SSR frontend (PORT).

set -e

echo "[start] Starting Vaanix AI..."

# Start Express backend on internal port 3001
BACKEND_PORT=3001 NODE_ENV=production tsx src/server/index.ts &
BACKEND_PID=$!
echo "[start] Express backend PID=$BACKEND_PID on port 3001"

# Give Express a moment to bind before nitro starts accepting traffic
sleep 2

# Start the nitro node-server (serves frontend + proxies /api to Express)
# NITRO_PORT is picked up by the node-server preset to listen on $PORT
echo "[start] Starting nitro node-server on port $PORT..."
node .output/server/index.mjs

# If nitro exits, kill the Express backend too
kill $BACKEND_PID 2>/dev/null || true
