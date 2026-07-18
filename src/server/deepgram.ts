import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { LiveTranscriber } from "@deepgram/sdk";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

export function createDeepgramStream(
  onTranscript: (text: string) => void,
  onError: (err: any) => void
) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("Missing DEEPGRAM_API_KEY environment variable.");
  }

  const deepgram = createClient(DEEPGRAM_API_KEY);
  const connection = deepgram.listen.live({
    model: "nova-2-phone",
    language: "en-US",
    smart_format: true,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    endpointing: 300, // wait 300ms of silence to finalize sentence
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log("[Deepgram] Connected to Live stream.");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const text = data.channel.alternatives[0].transcript;
    if (text && data.is_final) {
      onTranscript(text);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error("[Deepgram] Connection error:", error);
    onError(error);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log("[Deepgram] Connection closed.");
  });

  return connection;
}
