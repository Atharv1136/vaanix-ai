const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // default voice

export async function getElevenLabsVoiceStream(text: string): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("Missing ELEVENLABS_API_KEY environment variable.");
  }

  // Twilio wants mulaw audio 8kHz mono. ElevenLabs supports returning PCM or MP3.
  // We can request Elevenlabs PCM audio (e.g. pcm_8000, pcm_16000, pcm_22050, pcm_44100) or MP3.
  // Using pcm_8000 allows us to easily convert PCM raw data directly into 8kHz mulaw bytes.
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API returned ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
