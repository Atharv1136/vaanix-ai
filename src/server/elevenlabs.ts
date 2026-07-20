import { getEdgeTtsAudio, isEdgeVoice } from "./edgeTts";

/**
 * Unified TTS function. Routes to the best available provider:
 * 1. Edge TTS (Microsoft) — if it's an Edge voice (free, no API key, excellent quality)
 * 2. ElevenLabs — if ELEVENLABS_API_KEY present and ElevenLabs voice ID
 * 3. Neets — if NEETS_API_KEY present and Neets voice ID
 * 4. Deepgram Aura — always available as final fallback (English only)
 */
export async function getElevenLabsVoiceStream(
  text: string,
  voiceId?: string,
  signal?: AbortSignal,
  language?: string,
): Promise<Buffer> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
  const NEETS_API_KEY = process.env.NEETS_API_KEY || "";
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

  // 1. Microsoft Edge TTS — free, no API key, supports Hindi/Marathi Neural voices
  if (voiceId && isEdgeVoice(voiceId)) {
    console.log(`[TTS] Requesting Edge TTS with voice: ${voiceId}`);
    try {
      const buffer = await getEdgeTtsAudio(text, voiceId, signal);
      return buffer;
    } catch (err: any) {
      console.warn(`[TTS] Edge TTS failed: ${err.message}. Falling back...`);
    }
  }

  // 2. ElevenLabs — if key is present and it's an ElevenLabs voice ID
  if (
    ELEVENLABS_API_KEY &&
    voiceId &&
    !voiceId.startsWith("aura-") &&
    !voiceId.startsWith("us-") &&
    !isEdgeVoice(voiceId)
  ) {
    const finalVoiceId = voiceId || "pNInz6obbfDQGcgMyIGC";
    console.log(`[TTS] Requesting ElevenLabs with voice: ${finalVoiceId}`);
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}/stream?output_format=pcm_8000`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          signal,
        },
      );
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } else {
        const errText = await response.text();
        console.warn(`[TTS] ElevenLabs failed with status ${response.status}: ${errText}. Falling back...`);
      }
    } catch (err: any) {
      console.warn(`[TTS] ElevenLabs error: ${err.message}. Falling back...`);
    }
  }

  // 3. Neets — if key present and it's a Neets voice
  if (NEETS_API_KEY && voiceId && (voiceId.startsWith("us-") || voiceId.startsWith("uk-"))) {
    console.log(`[TTS] Requesting Neets with voice: ${voiceId}`);
    try {
      const response = await fetch("https://api.neets.ai/v1/tts", {
        method: "POST",
        headers: { "X-API-Key": NEETS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ text, voice_id: voiceId, params: { model: "vits" } }),
        signal,
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } else {
        const errText = await response.text();
        console.warn(`[TTS] Neets failed with status ${response.status}: ${errText}. Falling back...`);
      }
    } catch (err: any) {
      console.warn(`[TTS] Neets error: ${err.message}. Falling back...`);
    }
  }

  // 4. Deepgram Aura — final fallback (English only, always available)
  if (DEEPGRAM_API_KEY) {
    const finalVoiceId = voiceId && voiceId.startsWith("aura-") ? voiceId : "aura-asteria-en";
    console.log(`[TTS] Requesting Deepgram Aura with voice: ${finalVoiceId}`);
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${finalVoiceId}&encoding=linear16&sample_rate=8000&container=none`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal,
      },
    );
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      const errorText = await response.text();
      throw new Error(`Deepgram Aura API returned ${response.status}: ${errorText}`);
    }
  }

  throw new Error(
    "No TTS provider available. Please configure DEEPGRAM_API_KEY or ELEVENLABS_API_KEY.",
  );
}

// Convert raw 8kHz 16-bit linear PCM audio into 8kHz 8-bit mulaw format
export function linearPCMToMulaw(pcmBuffer: Buffer): Buffer {
  const mulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = linear2ulaw(sample);
  }
  return mulawBuffer;
}

// Encoder logic for linear PCM to Mu-law
function linear2ulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
