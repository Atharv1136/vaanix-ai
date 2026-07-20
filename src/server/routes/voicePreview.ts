import { Router, Request, Response } from "express";
import { getEdgeTtsAudio, EDGE_VOICES, PREVIEW_PHRASES } from "../edgeTts";

export const voicePreviewRouter = Router();

/**
 * GET /api/voice-preview
 * Query params:
 *   voice_id — e.g. "hi-IN-SwaraNeural"
 *   language  — e.g. "hi-IN" (used to pick sample phrase)
 *   text      — optional custom text to speak
 *
 * Returns raw PCM audio at 8kHz (for use in browser via AudioContext).
 * Or returns an error JSON if the voice isn't a valid Edge TTS voice.
 */
voicePreviewRouter.get("/api/voice-preview", async (req: Request, res: Response) => {
  const { voice_id, language, text } = req.query as Record<string, string>;

  if (!voice_id) {
    return res.status(400).json({ error: "voice_id is required" });
  }

  const isEdgeVoice = EDGE_VOICES.some((v) => v.voiceId === voice_id);

  if (!isEdgeVoice) {
    // For Deepgram Aura voices, use the Deepgram speak API
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "No TTS provider available" });
    }

    const sampleText = text || "Hello! How can I help you today?";
    try {
      const response = await fetch(
        `https://api.deepgram.com/v1/speak?model=${voice_id}&encoding=linear16&sample_rate=8000&container=none`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text: sampleText }),
        },
      );
      if (!response.ok) {
        const err = await response.text();
        return res.status(500).json({ error: `Deepgram failed: ${err}` });
      }
      const arrayBuffer = await response.arrayBuffer();
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": arrayBuffer.byteLength,
        "Cache-Control": "public, max-age=3600",
      });
      return res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Edge TTS voice — pick a language-appropriate phrase
  const lang = language || EDGE_VOICES.find((v) => v.voiceId === voice_id)?.language || "en-US";
  const sampleText = text || PREVIEW_PHRASES[lang] || PREVIEW_PHRASES["en-US"];

  try {
    const pcmBuffer = await getEdgeTtsAudio(sampleText, voice_id);

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": pcmBuffer.length,
      "Cache-Control": "public, max-age=3600",
    });

    // Prepend a minimal WAV header so the browser can play it directly
    const wavBuffer = addWavHeader(pcmBuffer, 8000, 1, 16);
    res.send(wavBuffer);
  } catch (err: any) {
    console.error("[VoicePreview] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Adds a standard RIFF WAV header to raw PCM data.
 */
function addWavHeader(
  pcmData: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);           // PCM subchunk size
  header.writeUInt16LE(1, 20);            // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
