import { WebSocket } from "ws";
import { createDeepgramStream } from "../deepgram";
import { getAIReplyStream } from "../nvidia";
import { getElevenLabsVoiceStream, linearPCMToMulaw } from "../elevenlabs";
import {
  getAssistant,
  getAssistantTools,
  saveCallTranscriptTurn,
  updateCallStatus,
  getAssistantQAs,
  getAssistantKBDocuments,
  Assistant,
  Tool,
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

function broadcastTranscription(
  callId: string,
  speaker: "caller" | "ai" | "tool",
  text: string,
  isFinal: boolean = true,
) {
  const clients = transcriptionClients.get(callId);
  if (clients) {
    const message = JSON.stringify({
      type: "transcription",
      speaker,
      text,
      isFinal,
      timestamp: new Date().toISOString(),
    });
    clients.forEach((ws) => {
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

function calculateSimilarity(str1: string, str2: string): number {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const words1 = clean(str1);
  const words2 = clean(str2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const stopWords = new Set([
    "what", "is", "the", "a", "an", "of", "to", "for", "please", "can",
    "you", "tell", "me", "how", "much", "does", "do", "i", "get", "any",
    "about", "are", "on", "in", "at", "with",
  ]);
  const filtered1 = words1.filter((w) => !stopWords.has(w));
  const filtered2 = words2.filter((w) => !stopWords.has(w));

  const final1 = filtered1.length > 0 ? filtered1 : words1;
  const final2 = filtered2.length > 0 ? filtered2 : words2;

  const set1 = new Set(final1);
  const set2 = new Set(final2);

  let intersectionCount = 0;
  for (const w of set1) {
    if (set2.has(w) || Array.from(set2).some((o) => o.startsWith(w) || w.startsWith(o))) {
      intersectionCount++;
    }
  }

  const unionCount = set1.size + set2.size - intersectionCount;
  return unionCount > 0 ? intersectionCount / unionCount : 0;
}

/**
 * Detect sentence boundaries in accumulated text.
 * Returns [completedSentences, remainder].
 */
function extractSentences(buffer: string): [string[], string] {
  // Match sentence endings: . ! ? followed by space or end-of-string, or line breaks
  const sentenceEndPattern = /([.!?])\s+|([.!?])$/;
  const sentences: string[] = [];
  let remaining = buffer;

  while (true) {
    const match = sentenceEndPattern.exec(remaining);
    if (!match) break;
    const endIdx = match.index + match[0].length;
    const sentence = remaining.substring(0, endIdx).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    remaining = remaining.substring(endIdx);
  }

  return [sentences, remaining];
}

/**
 * Send a PCM buffer as mulaw audio to Twilio.
 */
function sendAudioToTwilio(
  ws: WebSocket,
  streamSid: string,
  pcmBuffer: Buffer,
): number {
  const mulawBuffer = linearPCMToMulaw(pcmBuffer);
  const base64Audio = mulawBuffer.toString("base64");
  ws.send(
    JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: base64Audio },
    }),
  );
  // Return expected playback duration in ms
  return Math.round((mulawBuffer.length * 1000) / 8000);
}

export function handleMediaStream(ws: WebSocket) {
  let callSid = "";
  let streamSid = "";
  let deepgramStream: any = null;
  let conversationHistory: any[] = [];
  let turnIndex = 0;
  let callStartTime = Date.now();
  let callEnded = false;
  let loggedFirstMedia = false;

  let assistant: Assistant | null = null;
  let tools: Tool[] = [];
  let cachedQAs: any[] = [];
  let kbDocs: any[] = [];

  let isAISpeaking = false;
  let activeAbortController: AbortController | null = null;
  let callTimeout: NodeJS.Timeout | null = null;
  let playbackEndTimer: NodeJS.Timeout | null = null;

  const handleFailover = async (err: any) => {
    console.error(`[MediaStream] Orchestrator error for call ${callSid}:`, err);
    cleanup();
  };

  const cleanup = () => {
    if (callEnded) return;
    callEnded = true;
    console.log(`[MediaStream] Cleaning up connections for call ${callSid}`);

    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null; }
    if (playbackEndTimer) { clearTimeout(playbackEndTimer); playbackEndTimer = null; }

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    if (deepgramStream) {
      try { deepgramStream.close(); } catch (e) {}
    }

    if (callSid) {
      const durationSeconds = Math.round((Date.now() - callStartTime) / 1000);
      updateCallStatus(callSid, durationSeconds, "resolved");
    }

    ws.close();
  };

  const interruptAI = () => {
    if (!isAISpeaking && !activeAbortController) return;

    console.log(`[MediaStream] Caller interrupted AI on Call ${callSid?.substring(0, 8)}.`);

    // 1. Tell Twilio to clear the audio queue
    if (streamSid && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "clear", streamSid }));
    }

    // 2. Abort active generation & TTS
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    if (playbackEndTimer) { clearTimeout(playbackEndTimer); playbackEndTimer = null; }

    isAISpeaking = false;
  };

  /**
   * Sentence-level streaming pipeline.
   * Fires TTS immediately for each sentence as it arrives from the LLM.
   * This cuts Time-To-First-Audio from ~10s to ~1-2s.
   */
  async function streamReplyWithSentencePipeline(
    replyGenerator: AsyncGenerator<string, void, unknown>,
    controller: AbortController,
    label: string,
  ): Promise<string> {
    let textBuffer = "";
    let fullReplyText = "";
    let totalPlaybackMs = 0;
    let sentenceIndex = 0;

    const speakSentence = async (sentence: string) => {
      if (controller.signal.aborted || callEnded) return;
      const trimmed = sentence.trim();
      if (!trimmed) return;

      console.log(`[AI] ${label} sentence ${++sentenceIndex}: "${trimmed}"`);
      isAISpeaking = true;

      try {
        const pcmBuffer = await getElevenLabsVoiceStream(
          trimmed,
          assistant!.voice_id,
          controller.signal,
          (assistant as any).language,
        );

        if (controller.signal.aborted || callEnded) return;

        const playbackMs = sendAudioToTwilio(ws, streamSid, pcmBuffer);
        totalPlaybackMs += playbackMs;
      } catch (err: any) {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          console.warn(`[TTS] Error for sentence: ${err.message}`);
        }
      }
    };

    // Stream chunks from LLM, fire TTS per sentence boundary
    for await (const chunk of replyGenerator) {
      if (controller.signal.aborted) break;
      textBuffer += chunk;
      fullReplyText += chunk;

      const [sentences, remaining] = extractSentences(textBuffer);
      textBuffer = remaining;

      for (const sentence of sentences) {
        await speakSentence(sentence);
        if (controller.signal.aborted) break;
      }
    }

    // Flush any remaining text (no trailing punctuation)
    if (!controller.signal.aborted && textBuffer.trim()) {
      await speakSentence(textBuffer);
      fullReplyText = fullReplyText; // already accumulated
    }

    // Set timer for when AI finishes speaking
    if (!controller.signal.aborted && totalPlaybackMs > 0) {
      if (playbackEndTimer) clearTimeout(playbackEndTimer);
      playbackEndTimer = setTimeout(() => {
        if (activeAbortController === controller) {
          isAISpeaking = false;
          activeAbortController = null;
        }
      }, totalPlaybackMs + 600);
    } else if (!controller.signal.aborted) {
      isAISpeaking = false;
      if (activeAbortController === controller) activeAbortController = null;
    }

    return fullReplyText;
  }

  ws.on("message", async (message: string) => {
    try {
      const data: TwilioMediaPayload = JSON.parse(message);

      if (data.event === "start" && data.start) {
        callSid = data.start.callSid;
        streamSid = data.start.streamSid;

        const assistantId = data.start.customParameters?.assistant_id;
        const callRecordId = data.start.customParameters?.call_record_id || callSid;
        const callerName = data.start.customParameters?.caller_name || "";
        if (callRecordId) callSid = callRecordId;

        console.log(
          `[MediaStream] Started stream ${streamSid} for Call ${callSid.substring(0, 8)}... Caller Name: "${callerName}"`,
        );

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

        // Apply caller name placeholder replacements
        const normalizedName = callerName ? callerName.trim() : "";
        if (assistant) {
          assistant = {
            ...assistant,
            system_prompt: assistant.system_prompt
              .replace(/\{name\}/gi, normalizedName || "the caller")
              .replace(/\[name\]/gi, normalizedName || "the caller")
              .replace(/\(name\)/gi, normalizedName || "the caller"),
          };
          if (assistant.first_message) {
            assistant = {
              ...assistant,
              first_message: normalizedName
                ? assistant.first_message
                    .replace(/\{name\}/gi, normalizedName)
                    .replace(/\[name\]/gi, normalizedName)
                    .replace(/\(name\)/gi, normalizedName)
                : assistant.first_message
                    .replace(/\{name\}/gi, "there")
                    .replace(/\[name\]/gi, "there")
                    .replace(/\(name\)/gi, "there")
                    .replace(/\s+/g, " ")
                    .trim(),
            };
          }
        }

        tools = await getAssistantTools(assistantId);

        // Load QAs and KB Documents
        try {
          const [qas, docs] = await Promise.all([
            getAssistantQAs(assistantId),
            getAssistantKBDocuments(assistantId),
          ]);
          cachedQAs = qas;
          kbDocs = docs;
          console.log(
            `[MediaStream] Loaded ${cachedQAs.length} cached QAs and ${kbDocs.length} KB docs for Call ${callSid.substring(0, 8)}.`,
          );
        } catch (dbErr) {
          console.error("[MediaStream] Error loading DB context:", dbErr);
        }

        // Push initial first message
        if (assistant.first_message) {
          conversationHistory.push({ speaker: "ai", text: assistant.first_message });
          const firstMsg = assistant.first_message;

          setTimeout(async () => {
            try {
              console.log(`[AI] Speaking first message: "${firstMsg}"`);
              await saveCallTranscriptTurn(callSid, "ai", firstMsg, turnIndex++);
              broadcastTranscription(callSid, "ai", firstMsg);

              const firstMsgController = new AbortController();
              activeAbortController = firstMsgController;
              isAISpeaking = true;

              const pcmBuffer = await getElevenLabsVoiceStream(
                firstMsg,
                assistant!.voice_id,
                firstMsgController.signal,
                (assistant as any).language,
              );
              if (!firstMsgController.signal.aborted && !callEnded) {
                const playbackMs = sendAudioToTwilio(ws, streamSid, pcmBuffer);
                if (playbackEndTimer) clearTimeout(playbackEndTimer);
                playbackEndTimer = setTimeout(() => {
                  if (activeAbortController === firstMsgController) {
                    isAISpeaking = false;
                    activeAbortController = null;
                  }
                }, playbackMs + 600);
              }
            } catch (err) {
              console.error("[MediaStream] Error playing first message:", err);
            }
          }, 1000);
        }

        // 8-minute max call duration
        callTimeout = setTimeout(() => {
          console.log(`[MediaStream] Call ${callSid} exceeded 8 minutes. Graceful termination.`);
          cleanup();
        }, 8 * 60 * 1000);

        // Start Deepgram STT stream — non-fatal if it fails
        const assistantLanguage = (assistant as any).language || "en-US";
        try {
          deepgramStream = await createDeepgramStream(
            async (text: string) => {
              if (callEnded || !assistant) return;
              console.log(`[Caller] Says (final): "${text}"`);

              interruptAI();

              await saveCallTranscriptTurn(callSid, "caller", text, turnIndex++);
              conversationHistory.push({ speaker: "caller", text });
              broadcastTranscription(callSid, "caller", text);

              const turnController = new AbortController();
              activeAbortController = turnController;

              try {
                // 1. Fast-path: QA cache lookup
                let matchedAnswer = "";
                let bestScore = 0;
                let bestQA: any = null;

                for (const qa of cachedQAs) {
                  const score = calculateSimilarity(text, qa.question);
                  if (score > bestScore) {
                    bestScore = score;
                    bestQA = qa;
                  }
                }

                if (bestScore >= 0.45 && bestQA) {
                  matchedAnswer = bestQA.answer;
                  console.log(
                    `[Cache Hit] Score: ${bestScore.toFixed(2)} → "${bestQA.question}"`,
                  );
                }

                if (matchedAnswer) {
                  isAISpeaking = true;
                  console.log(`[AI] Cache Answer: "${matchedAnswer}"`);
                  await saveCallTranscriptTurn(callSid, "ai", matchedAnswer, turnIndex++);
                  broadcastTranscription(callSid, "ai", matchedAnswer);
                  conversationHistory.push({ speaker: "ai", text: matchedAnswer });

                  const pcmBuffer = await getElevenLabsVoiceStream(
                    matchedAnswer,
                    assistant.voice_id,
                    turnController.signal,
                    (assistant as any).language,
                  );
                  if (!turnController.signal.aborted && !callEnded) {
                    const playbackMs = sendAudioToTwilio(ws, streamSid, pcmBuffer);
                    if (playbackEndTimer) clearTimeout(playbackEndTimer);
                    playbackEndTimer = setTimeout(() => {
                      if (activeAbortController === turnController) {
                        isAISpeaking = false;
                        activeAbortController = null;
                      }
                    }, playbackMs + 600);
                  }
                  return;
                }

                // 2. Cache miss — KB injection + LLM with sentence-level streaming
                console.log(`[Cache Miss] Streaming LLM response.`);

                let kbContext = "";
                if (kbDocs.length > 0) {
                  const lowerText = text.toLowerCase();
                  const matchedDocs = kbDocs.filter(
                    (d) =>
                      d.title.toLowerCase().includes(lowerText) ||
                      d.content.toLowerCase().includes(lowerText) ||
                      lowerText
                        .split(/\s+/)
                        .some((word) => word.length > 3 && d.content.toLowerCase().includes(word)),
                  );

                  if (matchedDocs.length > 0) {
                    kbContext = `Here is relevant context from the knowledge base for this question:\n${matchedDocs
                      .slice(0, 3)
                      .map((d) => `--- ${d.title} ---\n${d.content}`)
                      .join("\n\n")}\nAnswer the user's question using the above context.`;
                    console.log(`[KB] Injected ${matchedDocs.length} docs into context.`);
                  }
                }

                let generationHistory = [...conversationHistory];
                if (kbContext) {
                  generationHistory[generationHistory.length - 1] = {
                    speaker: "caller",
                    text: `${text}\n\n[CONTEXT:\n${kbContext}\n]`,
                  };
                }

                const replyGenerator = getAIReplyStream(
                  assistant,
                  tools,
                  generationHistory,
                  turnController.signal,
                );

                // 🚀 SENTENCE-LEVEL STREAMING: start speaking first sentence immediately
                const fullReplyText = await streamReplyWithSentencePipeline(
                  replyGenerator,
                  turnController,
                  "LLM",
                );

                if (turnController.signal.aborted) {
                  console.log("[MediaStream] LLM generation aborted.");
                  return;
                }

                if (fullReplyText) {
                  console.log(`[AI] Full reply: "${fullReplyText}"`);
                  await saveCallTranscriptTurn(callSid, "ai", fullReplyText, turnIndex++);
                  broadcastTranscription(callSid, "ai", fullReplyText);
                  conversationHistory.push({ speaker: "ai", text: fullReplyText });
                }

                // Check for tool-driven actions
                const lastTurn = conversationHistory[conversationHistory.length - 1];
                if (lastTurn?.speaker === "tool" && lastTurn.tool_results) {
                  for (const tr of lastTurn.tool_results) {
                    if (tr.content.includes("end_call")) {
                      console.log("[MediaStream] Tool requested end call.");
                      cleanup();
                    }
                  }
                }
              } catch (err: any) {
                if (err.name === "AbortError" || turnController.signal.aborted) {
                  console.log("[MediaStream] Turn aborted.");
                } else {
                  await handleFailover(err);
                }
              }
            },
            (err) => {
              // Deepgram STT error — non-fatal. Log and nullify so we stop sending audio to it.
              console.warn(`[Deepgram] STT error (non-fatal, call continues): ${err?.message || err}`);
              deepgramStream = null;
            },
            // Interim transcript → trigger early interruption
            (interimText: string) => {
              if (callEnded) return;
              if (isAISpeaking || activeAbortController) {
                console.log(`[Caller] Interim interrupt: "${interimText}"`);
                interruptAI();
              }
            },
            assistantLanguage,
          );
        } catch (dgErr: any) {
          // If Deepgram stream setup itself fails, call still continues — AI will still speak
          console.warn(`[Deepgram] Failed to initialise STT stream (non-fatal): ${dgErr?.message || dgErr}`);
          deepgramStream = null;
        }
      }

      if (data.event === "media" && data.media) {
        if (!loggedFirstMedia) {
          // SDK v5 uses getReadyState() instead of .readyState property
          const rs = deepgramStream?.getReadyState ? deepgramStream.getReadyState() : deepgramStream?.readyState;
          console.log(
            `[MediaStream] First media chunk received. readyState=${rs}`,
          );
          loggedFirstMedia = true;
        }
        if (deepgramStream) {
          // Support both SDK v5 getReadyState() and older .readyState property
          const readyState = deepgramStream.getReadyState
            ? deepgramStream.getReadyState()
            : deepgramStream.readyState;
          if (readyState === 1) {
            const rawAudioBuffer = Buffer.from(data.media.payload, "base64");
            deepgramStream.sendMedia(rawAudioBuffer);
          }
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
