import { Request, Response } from "express";
import { getElevenLabsVoiceStream } from "../elevenlabs";

export async function handleTTSPreview(req: Request, res: Response): Promise<void> {
  const { text } = req.body;

  if (!text) {
    res.status(400).json({ error: "Missing text parameter." });
    return;
  }

  try {
    console.log(`[TTSPreview] Generating audio preview for: "${text.substring(0, 30)}..."`);
    const audioBuffer = await getElevenLabsVoiceStream(text);
    
    // Send back raw audio stream
    res.set("Content-Type", "audio/mpeg");
    res.status(200).send(audioBuffer);
  } catch (error: any) {
    console.error("[TTSPreview] Error generating preview:", error);
    res.status(500).json({ error: error.message || "Failed to generate audio." });
  }
}
