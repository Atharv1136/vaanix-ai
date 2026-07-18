import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";

// Load local environment config variables
dotenv.config();

import { handleTwilioVoiceWebhook } from "./routes/twilioWebhook";
import { handleMediaStream } from "./mediaStream/handler";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Express HTTP endpoints
app.post("/webhooks/twilio/voice", handleTwilioVoiceWebhook);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Server bootstrap
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
