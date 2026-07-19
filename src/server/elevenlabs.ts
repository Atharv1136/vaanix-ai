export async function getElevenLabsVoiceStream(text: string, voiceId?: string): Promise<Buffer> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
  const ELEVENLABS_VOICE_ID = voiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  // 1. If ElevenLabs key is present, use ElevenLabs voice system
  if (ELEVENLABS_API_KEY) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream?output_format=pcm_8000`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  // 2. If Neets API key is present, use it as the budget voice system
  const NEETS_API_KEY = process.env.NEETS_API_KEY || "";
  const NEETS_VOICE_ID = voiceId || process.env.NEETS_VOICE_ID || "us-female-2";

  if (NEETS_API_KEY) {
    const response = await fetch("https://api.neets.ai/v1/tts", {
      method: "POST",
      headers: {
        "X-API-Key": NEETS_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: NEETS_VOICE_ID,
        params: {
          model: "vits",
        },
      }),
    });

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  // 3. Fallback to Deepgram Aura TTS if DEEPGRAM_API_KEY is present
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";
  const DEEPGRAM_VOICE_ID = voiceId || process.env.DEEPGRAM_VOICE_ID || "aura-asteria-en";

  if (DEEPGRAM_API_KEY) {
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${DEEPGRAM_VOICE_ID}&encoding=linear16&sample_rate=8000&container=none`,
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${DEEPGRAM_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      }
    );

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      const errorText = await response.text();
      throw new Error(`Deepgram Aura API returned ${response.status}: ${errorText}`);
    }
  }

  throw new Error("Missing ELEVENLABS_API_KEY, NEETS_API_KEY, and DEEPGRAM_API_KEY environment variables.");
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
  let sign = (sample >> 16) & 0x80;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  if (sample > CLIP) {
    sample = CLIP;
  }
  sample = sample + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--) {
    mask >>= 1;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  let ulawbyte = ~(sign | (exponent << 4) | mantissa);
  return ulawbyte & 0xff;
}
