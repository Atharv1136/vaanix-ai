import dotenv from "dotenv";
// Load local environment config variables as the very first step
dotenv.config();

import express from "express";
import http from "http";
import path from "path";
import { existsSync, readdirSync } from "fs";
import WebSocket, { WebSocketServer } from "ws";

if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { supabaseAdmin, getDefaultAssistantId, setDefaultAssistantId } from "./supabase";

import { handleTwilioVoiceWebhook } from "./routes/twilioWebhook";
import { handleMediaStream } from "./mediaStream/handler";
import { handleTTSPreview } from "./routes/ttsPreview";
import {
  handleOutboundBatch,
  handleSingleOutboundCall,
  updatePublicBaseUrl,
} from "./routes/outbound";
import { handleEndCall } from "./routes/calls";
import { handleVoiceToken } from "./routes/voiceToken";
import {
  authenticateApiKey,
  getAssistants,
  getAssistant,
  createAssistant,
  updateAssistant,
  deleteAssistant,
} from "./routes/assistants";
import {
  addPhoneNumber,
  syncPhoneNumbers,
  uploadKbDocument,
  getKbDocuments,
  deleteKbDocument,
} from "./routes/phoneAndKb";
import {
  handleGetQAs,
  handleGenerateQAs,
  handleSaveQA,
  handleDeleteQA,
  handleBulkSaveQAs,
} from "./routes/assistantQas";
import { voicePreviewRouter } from "./routes/voicePreview";
import {
  handleBulkCampaignStart,
  handleBulkCampaignPause,
  handleBulkCampaignResume,
  handleBulkCampaignRetryFailed,
  handleBulkCallStatus,
} from "./routes/bulkCampaign";
import {
  handleGenerateCallSummary,
  handleTestAiKey,
  handleGetKeyPoolStats,
} from "./routes/analyticsRoutes";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Dynamic tunnel URL detection
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    updatePublicBaseUrl(`https://${host}`);
  }
  next();
});

// Express HTTP endpoints
app.post("/api/config/tunnel", (req, res) => {
  const { url } = req.body;
  if (url) {
    updatePublicBaseUrl(url);
    res.json({ success: true, url });
  } else {
    res.status(400).json({ error: "Missing url." });
  }
});

app.post("/webhooks/twilio/voice", handleTwilioVoiceWebhook);
app.post("/api/voice-token", handleVoiceToken);
app.post("/api/tts/preview", handleTTSPreview);
app.post("/api/outbound/start", handleOutboundBatch);
app.post("/api/outbound/call", handleSingleOutboundCall);
app.post("/api/outbound/bulk/start", handleBulkCampaignStart);
app.post("/api/outbound/bulk/pause", handleBulkCampaignPause);
app.post("/api/outbound/bulk/resume", handleBulkCampaignResume);
app.post("/api/outbound/bulk/retry-failed", handleBulkCampaignRetryFailed);
app.post("/api/outbound/bulk/call-status", handleBulkCallStatus);
app.post("/api/calls/:id/end", handleEndCall);

// Assistants API (protected by API Key)
app.get("/api/assistants", authenticateApiKey, getAssistants);
app.get("/api/assistants/:id", authenticateApiKey, getAssistant);
app.post("/api/assistants", authenticateApiKey, createAssistant);
app.patch("/api/assistants/:id", authenticateApiKey, updateAssistant);
app.delete("/api/assistants/:id", authenticateApiKey, deleteAssistant);

// Phone Numbers API
app.post("/api/phone-numbers", addPhoneNumber);
app.post("/api/phone-numbers/sync", syncPhoneNumbers);

// Knowledge Base API
app.post("/api/assistants/:assistantId/kb-upload", uploadKbDocument);
app.get("/api/assistants/:assistantId/kb-documents", getKbDocuments);
app.delete("/api/kb-documents/:id", deleteKbDocument);

// Cached Q&As API
app.get("/api/assistants/:assistantId/qas", handleGetQAs);
app.post("/api/assistants/:assistantId/qas/generate", handleGenerateQAs);
app.post("/api/assistants/:assistantId/qas", handleSaveQA);
app.post("/api/assistants/:assistantId/qas/bulk", handleBulkSaveQAs);
app.delete("/api/qas/:id", handleDeleteQA);

// Default Agent Settings API
app.get("/api/settings/default-agent", async (_req, res) => {
  try {
    const defaultId = await getDefaultAssistantId();
    res.json({ default_assistant_id: defaultId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/default-agent", async (req, res) => {
  try {
    const { assistant_id } = req.body;
    await setDefaultAssistantId(assistant_id || null);
    res.json({ success: true, default_assistant_id: assistant_id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Health check route
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// Analytics + AI Key Pool routes
app.post("/api/analytics/call-summary/:callId", handleGenerateCallSummary);
app.post("/api/analytics/test-key", handleTestAiKey);
app.get("/api/analytics/key-pool-stats", handleGetKeyPoolStats);

// Voice preview (no auth needed — just sample audio)
app.use(voicePreviewRouter);

// ── Frontend Static Assets & SSR Page Proxy ──────────────────────────────
const staticDir = path.join(process.cwd(), ".output", "public");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

function serveSpaFallback(res: express.Response) {
  const indexFile = path.join(staticDir, "index.html");
  if (existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  const assetsDir = path.join(staticDir, "assets");
  let cssFile = "";
  let jsFile = "";

  try {
    if (existsSync(assetsDir)) {
      const files = readdirSync(assetsDir);
      cssFile = files.find((f) => f.startsWith("styles-") && f.endsWith(".css")) || "";
      jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js")) || "";
    }
  } catch {}

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vaanix AI Console</title>
  ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ""}
</head>
<body class="bg-background text-foreground antialiased">
  <div id="root"></div>
  ${jsFile ? `<script type="module" src="/assets/${jsFile}"></script>` : ""}
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

// Proxy all non-API GET requests to internal Nitro SSR server running on port 3001
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/webhooks")) {
    const headers = { ...req.headers };
    headers.host = "127.0.0.1:3001";

    const proxyReq = http.request(
      {
        host: "127.0.0.1",
        port: 3001,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        if (proxyRes.statusCode === 404) {
          return serveSpaFallback(res);
        }
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );
    proxyReq.on("error", (_err) => {
      serveSpaFallback(res);
    });
    req.pipe(proxyReq, { end: true });
    return;
  }
  next();
});

// Server bootstrap: Express listens directly on primary PORT (e.g. 10000 on Render / 3000 local)
// so WebSocket upgrade requests to /media-stream are handled natively without proxy drops.
const port = process.env.PORT || 3000;

const server = http.createServer(app);

// WebSocket server setup sharing the same HTTP port
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  handleMediaStream(ws);
});

// Upgrade HTTP upgrade request for WebSocket media stream routing
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

  if (pathname === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Startup auto-cleanup: sanitize orphaned in_progress calls and stale campaigns
(async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await (supabaseAdmin as any)
      .from("calls")
      .update({ outcome: "resolved", ended_at: new Date().toISOString() })
      .eq("outcome", "in_progress")
      .lt("started_at", fiveMinutesAgo);

    const { data: camps } = await (supabaseAdmin as any)
      .from("bulk_call_campaigns")
      .select("id, total_contacts, called_count")
      .eq("status", "running");

    if (camps) {
      for (const c of camps) {
        if (c.total_contacts > 0 && c.called_count >= c.total_contacts) {
          await (supabaseAdmin as any)
            .from("bulk_call_campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", c.id);
        }
      }
    }
    console.log("[Server] Telephony state sanitized on boot.");
  } catch (err: any) {
    console.warn("[Server] Startup sanitation notice:", err.message);
  }
})();

server.listen(port, () => {
  console.log(`[Server] CampusConnect persistent leg listening on port ${port}`);
});
