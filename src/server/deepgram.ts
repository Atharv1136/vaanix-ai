import { DeepgramClient } from "@deepgram/sdk";

export async function createDeepgramStream(
  onTranscript: (text: string) => void,
  onError: (err: any) => void
) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY environment variable.");
  }

  const deepgram = new DeepgramClient(apiKey);
  const connection = await deepgram.listen.v1.connect({
    model: "nova-2", // Use verified working model ID to prevent 403 Forbidden
    language: "en-US",
    smart_format: true,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    endpointing: 300, // wait 300ms of silence to finalize sentence
  });

  connection.on("open", () => {
    console.log("[Deepgram] Connected to Live stream.");
  });

  connection.on("message", (data: any) => {
    console.log("[Deepgram] Socket message:", JSON.stringify(data));
    if (data.type === "Results") {
      const text = data.channel?.alternatives?.[0]?.transcript || "";
      if (text && data.is_final) {
        onTranscript(text);
      }
    }
  });

  connection.on("error", (error: any) => {
    console.error("[Deepgram] Connection error:", error);
    onError(error);
  });

  connection.on("close", () => {
    console.log("[Deepgram] Connection closed.");
  });

  // Explicitly connect to establish the WebSocket
  connection.connect();
  await connection.waitForOpen();

  return connection;
}
