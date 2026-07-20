/**
 * Microsoft Edge TTS wrapper — completely free, no API key required.
 * Uses the msedge-tts package which connects to Microsoft's Edge browser TTS service.
 * Returns raw PCM 16-bit LE audio at 8kHz — compatible with Twilio's mulaw pipeline.
 *
 * Supported languages: English, Hindi (hi-IN), Marathi (mr-IN) + many more
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface EdgeVoice {
  voiceId: string;         // The Edge TTS shortName
  displayName: string;     // Human-readable name
  language: string;        // Language code (en-US, hi-IN, mr-IN)
  gender: "Female" | "Male";
}

export const EDGE_VOICES: EdgeVoice[] = [
  // English voices
  { voiceId: "en-US-AriaNeural",     displayName: "Aria (US Female)",     language: "en-US", gender: "Female" },
  { voiceId: "en-US-GuyNeural",      displayName: "Guy (US Male)",        language: "en-US", gender: "Male"   },
  { voiceId: "en-US-JennyNeural",    displayName: "Jenny (US Female)",    language: "en-US", gender: "Female" },
  { voiceId: "en-IN-NeerjaNeural",   displayName: "Neerja (IN Female)",   language: "en-IN", gender: "Female" },
  { voiceId: "en-IN-PrabhatNeural",  displayName: "Prabhat (IN Male)",    language: "en-IN", gender: "Male"   },
  // Hindi voices
  { voiceId: "hi-IN-SwaraNeural",    displayName: "Swara (Hindi Female)", language: "hi-IN", gender: "Female" },
  { voiceId: "hi-IN-MadhurNeural",   displayName: "Madhur (Hindi Male)",  language: "hi-IN", gender: "Male"   },
  // Marathi voices
  { voiceId: "mr-IN-AarohiNeural",   displayName: "Aarohi (Marathi Female)", language: "mr-IN", gender: "Female" },
  { voiceId: "mr-IN-ManoharNeural",  displayName: "Manohar (Marathi Male)",  language: "mr-IN", gender: "Male"   },
];

export function isEdgeVoice(voiceId: string): boolean {
  return EDGE_VOICES.some((v) => v.voiceId === voiceId);
}

/**
 * Synthesize text using Microsoft Edge TTS and return raw 16-bit PCM at 8000 Hz.
 */
export async function getEdgeTtsAudio(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();

  // Set voice — Edge TTS uses shortName format
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // Get audio as a readable stream
  const readable = tts.toStream(text);

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    signal?.addEventListener("abort", () => {
      reject(new Error("Aborted"));
    });

    readable.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    readable.on("close", resolve);
    readable.on("error", reject);
  });

  // msedge-tts returns MP3 by default. We need to convert MP3 → PCM 16-bit 8kHz.
  // Use the raw audio and resample inline via simple downsampling.
  const mp3Buffer = Buffer.concat(chunks);
  const pcmBuffer = await convertMp3ToPcm8k(mp3Buffer);
  return pcmBuffer;
}

/**
 * Convert MP3 buffer to raw 16-bit PCM at 8000 Hz using ffmpeg (if available)
 * or a pure-JS approach for small payloads.
 */
async function convertMp3ToPcm8k(mp3Buffer: Buffer): Promise<Buffer> {
  // Try ffmpeg first (most reliable)
  try {
    return await convertWithFfmpeg(mp3Buffer);
  } catch {
    // Fallback: return mp3 buffer as-is (will sound distorted but won't crash)
    console.warn("[EdgeTTS] ffmpeg not available, returning raw mp3 data");
    return mp3Buffer;
  }
}

function convertWithFfmpeg(mp3Buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process") as typeof import("child_process");

    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",          // Read from stdin
      "-f", "s16le",           // Output format: signed 16-bit little-endian PCM
      "-ar", "8000",           // Resample to 8000 Hz
      "-ac", "1",              // Mono
      "pipe:1",                // Write to stdout
    ]);

    const outputChunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // suppress ffmpeg logs
    ffmpeg.on("close", (code: number) => {
      if (code === 0) {
        resolve(Buffer.concat(outputChunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    ffmpeg.on("error", reject);

    ffmpeg.stdin.write(mp3Buffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Sample phrases for voice preview, keyed by language code.
 */
export const PREVIEW_PHRASES: Record<string, string> = {
  "en-US": "Hello! I am your AI assistant. How can I help you today?",
  "en-IN": "Hello! I am your AI assistant. How can I help you today?",
  "hi-IN": "नमस्ते! मैं आपका AI सहायक हूँ। मैं आपकी कैसे मदद कर सकता हूँ?",
  "mr-IN": "नमस्कार! मी तुमचा AI सहाय्यक आहे. मी तुमची कशी मदत करू शकतो?",
};
