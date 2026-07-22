# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build: install deps & compile frontend + server
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install bun (used for lockfile) + build tooling
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
  && curl -fsSL https://bun.sh/install | bash \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first (layer-cache friendly)
COPY package.json bun.lock bunfig.toml ./

# Install all dependencies (including devDependencies needed for build)
RUN bun install

# Copy full source
COPY . .

# Build the Vite/TanStack frontend + nitro node-server
RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime: lean image with ffmpeg for Edge TTS conversion
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Install ffmpeg (required by edgeTts.ts for MP3 → PCM 8kHz conversion)
# and curl for health checks
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install tsx globally to run the TypeScript Express server entry point
RUN npm install -g tsx

# Copy built nitro node-server output (frontend SSR)
COPY --from=builder /app/.output ./.output

# Copy source (Express server needs TypeScript files at runtime via tsx)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy production node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy startup script
COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x ./start.sh

# Render injects PORT dynamically; default to 3000
ENV PORT=3000
ENV BACKEND_PORT=3001
ENV NODE_ENV=production

EXPOSE 3000

# Healthcheck via the public nitro port
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# start.sh: boots Express (port 3001) then nitro node-server (PORT)
CMD ["sh", "./start.sh"]
