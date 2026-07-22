# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build: install deps & compile frontend assets
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install bun + build tooling
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
  && curl -fsSL https://bun.sh/install | bash \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first (layer-cache friendly)
COPY package.json bun.lock bunfig.toml ./

# Install all dependencies
RUN bun install

# Copy full source
COPY . .

# Build Vite/TanStack assets → .output/public/assets/
RUN bun run build

# Generate index.html that bootstraps the React SPA from the built assets
RUN node generate-index.mjs

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime: Express serves API + SPA static files
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# ffmpeg: required by edgeTts.ts (MP3 → PCM 8kHz)
# curl: used by HEALTHCHECK
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# tsx: runs the TypeScript Express server at runtime
RUN npm install -g tsx

# Frontend build output (static assets + generated index.html)
COPY --from=builder /app/.output/public ./.output/public

# Express server source (TypeScript, run via tsx)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Production node_modules + package manifest
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Render sets PORT automatically; default 3000
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Express starts, serves /api/* routes + static SPA from .output/public/
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["tsx", "src/server/index.ts"]
