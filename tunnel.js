import { spawn } from 'child_process';

const port = 3000;

function startTunnel() {
  console.log(`[Tunnel] Starting Serveo tunnel to port ${port}...`);
  
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=60',
    '-R', `80:localhost:${port}`,
    'serveo.net'
  ]);

  ssh.stdout.on('data', (data) => {
    handleOutput(data.toString());
  });

  ssh.stderr.on('data', (data) => {
    handleOutput(data.toString());
  });

  function handleOutput(text) {
    console.log(`[SSH] ${text.trim()}`);
    
    // Look for URL
    const match = text.match(/Forwarding HTTP traffic from (https:\/\/[a-zA-Z0-9.-]+)/i);
    if (match) {
      const url = match[1];
      console.log(`[Tunnel] Detected Serveo URL: ${url}`);
      registerUrl(url);
    }
  }

  async function registerUrl(url) {
    try {
      const res = await fetch('http://localhost:3000/api/config/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        console.log(`[Tunnel] Registered URL successfully with backend.`);
      } else {
        console.warn(`[Tunnel] Registration failed with status: ${res.status}`);
      }
    } catch (err) {
      console.warn(`[Tunnel] Failed to reach backend: ${err.message}`);
    }
  }

  ssh.on('close', (code) => {
    console.log(`[Tunnel] SSH process exited with code ${code}. Restarting in 5 seconds...`);
    setTimeout(startTunnel, 5000);
  });
  
  ssh.on('error', (err) => {
    console.error(`[Tunnel] SSH process error:`, err.message);
  });
}

startTunnel();
