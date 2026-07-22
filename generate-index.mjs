#!/usr/bin/env node
/**
 * generate-index.mjs
 * Scans .output/public/assets/ to find the main JS entry and CSS file,
 * then writes .output/public/index.html that bootstraps the React SPA.
 *
 * Run after `bun run build` in the Dockerfile.
 */

import { readdirSync, writeFileSync } from "fs";
import { join } from "path";

const assetsDir = ".output/public/assets";
const outFile = ".output/public/index.html";

const files = readdirSync(assetsDir);

// Main JS entry: the largest index-*.js file
const jsEntry = files
  .filter((f) => f.startsWith("index-") && f.endsWith(".js"))
  .sort((a, b) => {
    const sa = parseInt(a.replace(/\D/g, ""), 10);
    const sb = parseInt(b.replace(/\D/g, ""), 10);
    return sb - sa;
  })[0];

// CSS: styles-*.css
const cssEntry = files.find((f) => f.endsWith(".css"));

if (!jsEntry) {
  console.error("[generate-index] ERROR: no index-*.js found in", assetsDir);
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vaanix AI — Intelligent Voice Assistant Platform</title>
    <meta name="description" content="Vaanix AI — Build, deploy and manage AI-powered voice assistants for automated calling." />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    ${cssEntry ? `<link rel="stylesheet" href="/assets/${cssEntry}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${jsEntry}"></script>
  </body>
</html>`;

writeFileSync(outFile, html, "utf8");
console.log(`[generate-index] Written ${outFile}`);
console.log(`  JS  : /assets/${jsEntry}`);
console.log(`  CSS : /assets/${cssEntry ?? "(none)"}`);
