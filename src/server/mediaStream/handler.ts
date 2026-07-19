import { WebSocket } from "ws";
import { createDeepgramStream } from "../deepgram";
import { getAIReplyStream } from "../nvidia";
import { getElevenLabsVoiceStream, linearPCMToMulaw } from "../elevenlabs";
import { 
  getAssistant, 
  getAssistantTools, 
  saveCallTranscriptTurn, 
  updateCallStatus, 
  Assistant,
  Tool
} from "../supabase";

const transcriptionClients = new Map<string, Set<WebSocket>>();

export function addTranscriptionClient(callId: string, ws: WebSocket) {
  if (!transcriptionClients.has(callId)) {
    transcriptionClients.set(callId, new Set());
  }
  transcriptionClients.get(callId)!.add(ws);

  ws.on("close", () => {
    transcriptionClients.get(callId)?.delete(ws);
    if (transcriptionClients.get(callId)?.size === 0) {
      transcriptionClients.delete(callId);
    }
  });
}

function broadcastTranscription(callId: string, speaker: "caller" | "ai" | "tool", text: string, isFinal: boolean = true) {
  const clients = transcriptionClients.get(callId);
  if (clients) {
    const message = JSON.stringify({ type: "transcription", speaker, text, isFinal, timestamp: new Date().toISOString() });
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

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
  // History allows complex tool_calls in nvidia.ts, so we'll maintain a full state here.
  let conversationHistory: any[] = [];
  let turnIndex = 0;
  let callStartTime = Date.now();
  let callEnded = false;
  let loggedFirstMedia = false;
  
  let assistant: Assistant | null = null;
  let tools: Tool[] = [];

  const handleFailover = async (err: any) => {
    console.error(`[MediaStream] Orchestrator error occurred for call ${callSid}:`, err);
    cleanup();
  };

  const cleanup = () => {
    if (callEnded) return;
    callEnded = true;
    console.log(`[MediaStream] Cleaning up connections for call ${callSid}`);
    
    if (deepgramStream) {
      try { deepgramStream.close(); } catch (e) {}
    }

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
        
        const assistantId = data.start.customParameters?.assistant_id;
        const callRecordId = data.start.customParameters?.call_record_id || callSid;
        if (callRecordId) callSid = callRecordId;

        console.log(`[MediaStream] Started stream ${streamSid} for Call ${callSid.substring(0, 8)}...`);

        if (!assistantId) {
          console.error("[MediaStream] No assistant_id passed in customParameters.");
          cleanup();
          return;
        }

        // Fetch Assistant and Tools
        assistant = await getAssistant(assistantId);
        if (!assistant) {
          console.error(`[MediaStream] Assistant ${assistantId} not found.`);
          cleanup();
          return;
        }

        tools = await getAssistantTools(assistantId);
        
        // Push initial first message if it exists
        if (assistant.first_message) {
           conversationHistory.push({ speaker: "ai", text: assistant.first_message });
           
           const firstMsg = assistant.first_message;
           const voiceId = assistant.voice_id;
           setTimeout(async () => {
             try {
               console.log(`[AI] Speaking first message: "${firstMsg}"`);
               await saveCallTranscriptTurn(callSid, "ai", firstMsg, turnIndex++);
               broadcastTranscription(callSid, "ai", firstMsg);

               const pcmBuffer = await getElevenLabsVoiceStream(firstMsg, voiceId);
               const mulawBuffer = linearPCMToMulaw(pcmBuffer);
               const base64Audio = mulawBuffer.toString("base64");

               if (!callEnded) {
                 ws.send(
                   JSON.stringify({
                     event: "media",
                     streamSid: streamSid,
                     media: {
                       payload: base64Audio,
                     },
                   })
                 );
               }
             } catch (err) {
               console.error("[MediaStream] Error playing first message:", err);
             }
           }, 1000);
        }

        setTimeout(() => {
          console.log(`[MediaStream] Call ${callSid} exceeded 8 minutes. Graceful termination.`);
          cleanup();
        }, 8 * 60 * 1000);

        // Start Deepgram Stream
        deepgramStream = await createDeepgramStream(
          async (text: string) => {
            if (callEnded || !assistant) return;
            console.log(`[Caller] Says: "${text}"`);
            
            await saveCallTranscriptTurn(callSid, "caller", text, turnIndex++);
            conversationHistory.push({ speaker: "caller", text });
            broadcastTranscription(callSid, "caller", text);

            try {
              let fullReplyText = "";
              const replyGenerator = getAIReplyStream(assistant, tools, conversationHistory);
              
              for await (const chunk of replyGenerator) {
                fullReplyText += chunk;
              }
              
              // We only broadcast text for now, but conversationHistory has tool usage recorded 
              // inside getAIReplyStream because we passed it by reference!

              if (fullReplyText) {
                 console.log(`[AI] Says: "${fullReplyText}"`);
                 await saveCallTranscriptTurn(callSid, "ai", fullReplyText, turnIndex++);
                 broadcastTranscription(callSid, "ai", fullReplyText);

                 const pcmBuffer = await getElevenLabsVoiceStream(fullReplyText, assistant.voice_id);
                 const mulawBuffer = linearPCMToMulaw(pcmBuffer);
                 const base64Audio = mulawBuffer.toString("base64");

                 ws.send(
                   JSON.stringify({
                     event: "media",
                     streamSid: streamSid,
                     media: {
                       payload: base64Audio,
                     },
                   })
                 );
              }
              
              // If last turn has tool results that say "transfer_call" or "end_call", process them
              const lastTurn = conversationHistory[conversationHistory.length - 1];
              if (lastTurn && lastTurn.speaker === "tool" && lastTurn.tool_results) {
                 for (const tr of lastTurn.tool_results) {
                    if (tr.content.includes("transfer_call")) {
                       // Future: execute twilio REST API redirect
                       console.log("[MediaStream] Tool requested transfer.");
                    } else if (tr.content.includes("end_call")) {
                       console.log("[MediaStream] Tool requested end call.");
                       cleanup();
                    }
                 }
              }

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
        if (!loggedFirstMedia) {
          console.log(`[MediaStream] Received first media chunk from Twilio. readyState=${deepgramStream?.readyState}`);
          loggedFirstMedia = true;
        }
        if (deepgramStream && deepgramStream.readyState === 1) {
          const rawAudioBuffer = Buffer.from(data.media.payload, "base64");
          deepgramStream.sendMedia(rawAudioBuffer);
        }
      }

      if (data.event === "stop") {
        console.log(`[MediaStream] Stopped stream for call ${callSid}`);
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
