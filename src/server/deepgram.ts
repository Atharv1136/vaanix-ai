import { DeepgramClient } from "@deepgram/sdk";

export async function createDeepgramStream(
  onTranscript: (text: string) => void,
  onError: (err: any) => void,
  onInterimTranscript?: (text: string) => void,
  language?: string,
) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY environment variable.");
  }

  // Map assistant language to Deepgram language code
  const deepgramLang = language === "hi-IN" ? "hi" : language === "mr-IN" ? "mr" : "en-US";

  const deepgram = new DeepgramClient(apiKey);
  const connection = await deepgram.listen.v1.connect({
    model: "nova-2",
    language: deepgramLang,
    smart_format: true,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    endpointing: 150,       // Reduced from 300ms for faster sentence finalization
    utterance_end_ms: 1000, // Fire transcript after 1s of utterance silence
  });

  connection.on("open", () => {
    console.log(`[Deepgram] Connected to Live stream. Language: ${deepgramLang}`);
  });

  connection.on("message", (data: any) => {
    if (data.type === "Results") {
      const text = data.channel?.alternatives?.[0]?.transcript || "";
      if (text) {
        if (data.is_final) {
          onTranscript(text);
        } else if (onInterimTranscript) {
          onInterimTranscript(text);
        }
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
