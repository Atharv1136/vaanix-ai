# Technology Stack

**Analysis Date:** 2026-07-18

## Languages

**Primary:**
- TypeScript (v5.8.3) - React components, routing, and backend definitions.
- HTML5 / CSS3 - Document structure and Tailwind CSS styles.

**Secondary:**
- JavaScript - Build orchestration configs and linting rules.

## Runtime

**Environment:**
- Node.js (via Bun package runner / bundler)
- Web Browser - Modern frontend application execution environment.

**Package Manager:**
- Bun (using `bun.lock` lockfile, with package.json dependencies).

## Frameworks

**Core:**
- TanStack Start (React-Start) - Full-stack React framework with SSR, powered by Nitro.
- React (v19.2.0) - Declarative UI library.
- TanStack React Router - Type-safe routing engine.
- TanStack React Query - Asynchronous state synchronization & caching manager.

**Styling:**
- Tailwind CSS (v4.2.1) - Utility-first styling framework with Vite integration via `@tailwindcss/vite`.
- Radix UI - Primitive unstyled accessible UI components.
- Framer Motion - Declarative micro-animations.

**Build/Dev:**
- Vite (v8.0.16) - Frontend bundling and dev server.
- ESLint + Prettier - Naming enforcement and style quality checks.

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` - Realtime and database connectivity layer.
- `zod` - Runtime schema-based validations.
- `lucide-react` - Unified premium UI iconography.
- `sonner` - Actionable toast notifications.

## Configuration

**Environment:**
- `.env` - Credentials and API keys (Supabase keys, Twilio configs).

**Build:**
- `vite.config.ts` - Bundle orchestration.
- `tsconfig.json` - Typecheck settings.
- `components.json` - Radix / Tailwind shadcn settings.

## Platform Requirements

**Development:**
- Cross-platform (Windows / macOS / Linux with Node.js and Bun installed).

**Production:**
- Serves via Serverless (Cloudflare Pages / Vercel) or a persistent hosting server (Railway, Render) since WebSocket server logic is required for Twilio streams.

---
*Stack analysis: 2026-07-18*
*Update after major dependency changes*
