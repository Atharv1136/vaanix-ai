import type { WebSocket } from "ws";
import { createDeepgramStream } from "../deepgram";
import { getClaudeReplyStream } from "../claude";
import { getElevenLabsVoiceStream, linearPCMToMulaw } from "../elevenlabs";
import { getKnowledgeBase, saveCallTranscriptTurn, updateCallStatus, incrementCommonQuery } from "../supabase";
import { redirectCallToStaff } from "../twilioClient";

interface TwilioMediaPayload {
  event: "start" | "media" | "stop";
  sequenceNumber: string;
  start?: {
    accountSid: string;
    streamSid: string;
    callSid: string;
    tracks: string[];
    customParameters?: Record<string, string>;
  };
  media?: {
    track: "inbound" | "outbound";
    chunk: string;
    timestamp: string;
    payload: string;
  };
  streamSid?: string;
}

export function handleMediaStream(ws: WebSocket) {
  let callSid = "";
  let streamSid = "";
  let deepgramStream: any = null;
  let conversationHistory: { speaker: "student" | "ai"; text: string }[] = [];
  let knowledgeBase: any[] = [];
  let turnIndex = 0;
  let callStartTime = Date.now();
  let callEnded = false;
  let lineForwardNumber = "";

  const handleFailover = async (err: any) => {
    console.error(`[MediaStream] Orchestrator error occurred for call ${callSid}:`, err);
    if (callSid && lineForwardNumber) {
      await redirectCallToStaff(callSid, lineForwardNumber);
    }
    cleanup();
  };

  const cleanup = () => {
    if (callEnded) return;
    callEnded = true;
    console.log(`[MediaStream] Cleaning up connections for call ${callSid}`);
    
    // Close Deepgram
    if (deepgramStream) {
      try {
        deepgramStream.finish();
      } catch (e) {}
    }

    // Save final status to DB
    if (callSid) {
      const durationSeconds = Math.round((Date.now() - callStartTime) / 1000);
      updateCallStatus(callSid, durationSeconds, "resolved");
    }

    ws.close();
  };

  ws.on("message", async (message: string) => {
    try {
      const data: TwilioMediaPayload = JSON.parse(message);

      if (data.event === "start" && data.start) {
        callSid = data.start.callSid;
        streamSid = data.start.streamSid;
        
        // Grab custom parameters sent from webhook
        lineForwardNumber = data.start.customParameters?.forward_to || "";
        const callRecordId = data.start.customParameters?.call_record_id || callSid;
        if (callRecordId) {
          callSid = callRecordId; // Bind call record ID to track
        }

        console.log(`[MediaStream] Started stream ${streamSid} for Call ${callSid.substring(0, 8)}...`);

        // Fetch Knowledge Base
        knowledgeBase = await getKnowledgeBase();

        // 8 minute timeout limit to prevent hanging connections
        setTimeout(() => {
          console.log(`[MediaStream] Call ${callSid} exceeded 8 minutes. Graceful termination.`);
          cleanup();
        }, 8 * 60 * 1000);

        // Start Deepgram Stream
        deepgramStream = createDeepgramStream(
          async (text: string) => {
            if (callEnded) return;
            console.log(`[Student] Says: "${text}"`);
            
            // Log Student Turn
            await saveCallTranscriptTurn(callSid, "student", text, turnIndex++);
            conversationHistory.push({ speaker: "student", text });
            
            // Check for exit / transfer keywords immediately to skip Claude
            const transferKeywords = ["human", "person", "staff", "operator", "talk to someone", "representative"];
            const wantsTransfer = transferKeywords.some((kw) => text.toLowerCase().includes(kw));

            if (wantsTransfer) {
              console.log("[MediaStream] Student requested human transfer. Redirecting...");
              await handleFailover("User requested human transfer");
              return;
            }

            // Trigger Claude Brain reply
            try {
              let fullReplyText = "";
              const replyGenerator = getClaudeReplyStream(conversationHistory, knowledgeBase);
              
              for await (const chunk of replyGenerator) {
                fullReplyText += chunk;
              }

              console.log(`[AI Counselor] Says: "${fullReplyText}"`);

              // Log AI Turn
              await saveCallTranscriptTurn(callSid, "ai", fullReplyText, turnIndex++);
              conversationHistory.push({ speaker: "ai", text: fullReplyText });

              // Check if Claude requested transfer
              if (fullReplyText.includes("forward you to our admissions officer")) {
                await handleFailover("Claude requested transfer");
                return;
              }

              // Get TTS Voice Audio
              const pcmBuffer = await getElevenLabsVoiceStream(fullReplyText);
              const mulawBuffer = linearPCMToMulaw(pcmBuffer);
              const base64Audio = mulawBuffer.toString("base64");

              // Send audio frame to Twilio
              ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid: streamSid,
                  media: {
                    payload: base64Audio,
                  },
                })
              );
            } catch (err) {
              await handleFailover(err);
            }
          },
          (err) => {
            handleFailover(err);
          }
        );
      }

      if (data.event === "media" && data.media) {
        if (deepgramStream && deepgramStream.getReadyState() === 1) {
          const rawAudioBuffer = Buffer.from(data.media.payload, "base64");
          deepgramStream.send(rawAudioBuffer);
        }
      }

      if (data.event === "stop") {
        console.log(`[MediaStream] Stopped stream for call ${callSid}`);
        // Run quick query increment on final transcript statements
        const studentTurns = conversationHistory.filter(h => h.speaker === "student");
        if (studentTurns.length > 0) {
          const lastQuestion = studentTurns[studentTurns.length - 1].text;
          await incrementCommonQuery(lastQuestion);
        }
        cleanup();
      }
    } catch (error) {
      await handleFailover(error);
    }
  });

  ws.on("close", () => {
    cleanup();
  });

  ws.on("error", (err) => {
    handleFailover(err);
  });
}
