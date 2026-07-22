# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build: install deps & compile frontend + Nitro SSR
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install bun + build tooling
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
  && curl -fsSL https://bun.sh/install | bash \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:$PATH"

# Copy dependency manifests first
COPY package.json bun.lock bunfig.toml ./

# Install all dependencies
RUN bun install

# Copy full source
COPY . .

# Build with NITRO_PRESET=node-server so Nitro outputs a Node.js SSR server
RUN NITRO_PRESET=node-server bun run build

# Convert start.sh line endings to LF
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime: Nitro SSR server + Express backend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

# Install ffmpeg for Edge TTS conversion and curl for health check
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install tsx globally for Express server
RUN npm install -g tsx

# Copy built .output (contains .output/server and .output/public)
COPY --from=builder /app/.output ./.output

# Copy Express server source + tsconfig
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy production node_modules + package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy start.sh
COPY --from=builder /app/start.sh ./start.sh

# Environment defaults
ENV PORT=3000
ENV BACKEND_PORT=3001
ENV NODE_ENV=production

EXPOSE 3000

# Health check against health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["sh", "./start.sh"]
