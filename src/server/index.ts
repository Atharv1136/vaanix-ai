import dotenv from "dotenv";
// Load local environment config variables as the very first step
dotenv.config();

import express from "express";
import http from "http";
import path from "path";
import { existsSync } from "fs";
import { WebSocketServer } from "ws";

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

// Health check route
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// Voice preview (no auth needed — just sample audio)
app.use(voicePreviewRouter);

// ── Frontend SPA serving ──────────────────────────────────────────────────
// Serve built static assets from the Vite/TanStack build output.
// In production the Docker build runs generate-index.mjs to create index.html.
const staticDir = path.join(process.cwd(), ".output", "public");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir, { index: false }));

  // Catch-all: serve index.html for all non-API/non-webhook GET routes
  // so that TanStack Router can handle client-side navigation.
  app.get("*", (_req, res) => {
    const indexFile = path.join(staticDir, "index.html");
    if (existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.status(503).send("Frontend not built. Run generate-index.mjs after build.");
    }
  });
}

// Server bootstrap
// Express is the SOLE server — serves API routes + static SPA on PORT.
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

server.listen(port, () => {
  console.log(`[Server] CampusConnect persistent leg listening on port ${port}`);
});
