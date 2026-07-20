/**
 * Microsoft Edge TTS wrapper — completely free, no API key required.
 * Uses the msedge-tts package which connects to Microsoft's Edge browser TTS service.
 * Returns raw PCM 16-bit LE audio at 8kHz — compatible with Twilio's mulaw pipeline.
 *
 * Supported languages: English, Hindi (hi-IN), Marathi (mr-IN) + many more
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { Readable } from "stream";
import { spawn } from "child_process";

export interface EdgeVoice {
  voiceId: string;
  displayName: string;
  language: string;
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
 * Read all bytes from a Node.js Readable stream into a Buffer.
 */
function readStreamToBuffer(readable: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on("data", (chunk: Buffer) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

/**
 * Convert MP3/audio buffer → raw 16-bit PCM at 8000 Hz using ffmpeg.
 */
function convertToPcm8k(inputBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",     // Read from stdin
      "-f", "s16le",      // Output: signed 16-bit little-endian PCM
      "-ar", "8000",      // Resample to 8000 Hz
      "-ac", "1",         // Mono
      "pipe:1",           // Write to stdout
    ]);

    const outputChunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // suppress ffmpeg stderr
    ffmpeg.on("close", (code: number) => {
      if (code === 0) {
        resolve(Buffer.concat(outputChunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    ffmpeg.on("error", reject);

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Synthesize text using Microsoft Edge TTS and return raw 16-bit PCM at 8000 Hz.
 */
export async function getEdgeTtsAudio(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (signal?.aborted) throw new Error("Aborted");

  const tts = new MsEdgeTTS();

  // setMetadata must be called before toStream
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // toStream() returns { audioStream, metadataStream } — NOT a plain stream
  const { audioStream } = tts.toStream(text);

  // Read all MP3 bytes from the audio stream
  const mp3Buffer = await readStreamToBuffer(audioStream);

  tts.close();

  if (signal?.aborted) throw new Error("Aborted");

  // Convert MP3 → raw PCM 16-bit 8kHz via ffmpeg
  const pcmBuffer = await convertToPcm8k(mp3Buffer);
  return pcmBuffer;
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
