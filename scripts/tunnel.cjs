const localtunnel = require("localtunnel");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3000", 10);
const SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || "vaanix-ai-tunnel";
const ENV_PATH = path.resolve(__dirname, "..", ".env");

function updateEnvFile(newUrl) {
  try {
    if (fs.existsSync(ENV_PATH)) {
      let content = fs.readFileSync(ENV_PATH, "utf8");
      if (content.includes("PUBLIC_BASE_URL=")) {
        content = content.replace(/PUBLIC_BASE_URL=".*"/g, `PUBLIC_BASE_URL="${newUrl}"`);
      } else {
        content += `\nPUBLIC_BASE_URL="${newUrl}"\n`;
      }
      fs.writeFileSync(ENV_PATH, content, "utf8");
      console.log(`[Tunnel] Updated .env with PUBLIC_BASE_URL="${newUrl}"`);
    }
  } catch (err) {
    console.warn("[Tunnel] Could not update .env file:", err.message);
  }
}

function notifyExpressServer(newUrl) {
  try {
    const postData = JSON.stringify({ url: newUrl });
    const req = http.request(
      {
        hostname: "localhost",
        port: PORT,
        path: "/api/config/tunnel",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        console.log(`[Tunnel] Server accepted tunnel URL (${res.statusCode}): ${newUrl}`);
      }
    );
    req.on("error", (e) => {
      console.warn("[Tunnel] Server not reachable yet to notify tunnel URL:", e.message);
    });
    req.write(postData);
    req.end();
  } catch (err) {
    console.warn("[Tunnel] Failed to notify express server:", err.message);
  }
}

async function startTunnel() {
  console.log(`[Tunnel] Connecting to localtunnel.me (preferred subdomain: ${SUBDOMAIN}, port: ${PORT})...`);
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN, local_host: "127.0.0.1" });
    console.log(`[Tunnel] Online: ${tunnel.url}`);

    updateEnvFile(tunnel.url);
    notifyExpressServer(tunnel.url);

    tunnel.on("close", () => {
      console.warn("[Tunnel] Tunnel closed. Reconnecting in 2 seconds...");
      setTimeout(startTunnel, 2000);
    });

    tunnel.on("error", (err) => {
      console.error("[Tunnel] Tunnel error:", err.message);
      try { tunnel.close(); } catch {}
      setTimeout(startTunnel, 2000);
    });
  } catch (err) {
    console.error("[Tunnel] Failed to initialize tunnel:", err.message);
    setTimeout(startTunnel, 3000);
  }
}

// Keep process alive indefinitely
setInterval(() => {}, 60000);

startTunnel();
