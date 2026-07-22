// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this.
    // preset: node-server so the build outputs a real Node.js server (not cloudflare-module).
    server: {
      entry: "server",
      preset: "node-server",
    },
  },
  nitro: {
    // Proxy all API/webhook/WS routes to our Express backend (port 3001 in production)
    routeRules: {
      "/api/**": { proxy: "http://localhost:3001/**" },
      "/webhooks/**": { proxy: "http://localhost:3001/**" },
      "/health": { proxy: "http://localhost:3001/health" },
      "/api/voice-token": { proxy: "http://localhost:3001/api/voice-token" },
    },
  },
  vite: {
    server: {
      // Dev-only: proxy API calls to the local Express server on port 3000
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  },
});
