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
import { finalizeCall } from "../actions/postCall";

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
 * Sanitize digit speech: removes commas, semicolons, hyphens, and periods between digits
 * so TTS and sentence extractors do not produce stuttering, unnatural pauses, or split numbers.
 */
export function sanitizeDigitSpeech(text: string): string {
  if (!text) return "";
  return text
    // Replace comma, semicolon, dash between digits with single space (e.g. "9, 8; 7-6" -> "9 8 7 6")
    .replace(/([0-9०-९])\s*[,;\-–—]\s*(?=[0-9०-९])/g, "$1 ")
    // Remove comma or semicolon directly attached to a digit in digit groups
    .replace(/([0-9०-९])\s*[,;]\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect sentence boundaries in accumulated text.
 * Supports English, Hindi / Marathi (। ॥), newlines, and clause-level commas/semicolons.
 * Protects numbers, telephone digits, and dates from being sliced mid-sequence.
 * Returns [completedSentences, remainder].
 */
export function extractSentences(buffer: string): [string[], string] {
  // Pre-clean comma/semicolon-separated digits in the buffer so they are never sliced mid-number
  const cleanBuffer = buffer.replace(/([0-9०-९])\s*[,;\-–—]\s*(?=[0-9०-९])/g, "$1 ");

  // Matches sentence terminators (. ! ? । ॥ \n) or clause-level commas/semicolons
  // Crucial: (?<![\d०-९])[,;]\s+(?![\d०-९]) ensures commas/semicolons between or near digits are NEVER matched!
  const pattern = /([.!?।॥\n])\s*|((?<![\d०-९])[,;]\s+(?![\d०-९]))/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(cleanBuffer)) !== null) {
    const isClauseBreak = match[0].includes(",") || match[0].includes(";");
    const potentialSentence = cleanBuffer.substring(lastIndex, match.index + match[0].length).trim();

    // If it's a clause break (comma or semicolon):
    // 1. Must accumulate at least 24 characters so speech clauses are natural and not choppy
    // 2. Must not end with a digit to prevent breaking numbers
    if (isClauseBreak) {
      if (potentialSentence.length < 24) {
        continue;
      }
      if (/[\d०-९]\s*[,;]?$/.test(potentialSentence)) {
        continue;
      }
    }

    if (potentialSentence.length > 0) {
      sentences.push(sanitizeDigitSpeech(potentialSentence));
      lastIndex = match.index + match[0].length;
    }
  }

  const remainder = cleanBuffer.substring(lastIndex);
  return [sentences, remainder];
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
      if ((assistant as any)?.user_id) {
        finalizeCall(callSid, (assistant as any).user_id).catch(() => {});
      }
    }

    ws.close();
  };

  let aiSpeakingStartTime = 0;

  const interruptAI = (callerText?: string) => {
    if (!isAISpeaking && !activeAbortController) return;

    // Echo protection: Don't interrupt within the first 700ms of AI speech.
    // Acoustic echo from phone speaker often feeds back into mic on start.
    if (aiSpeakingStartTime > 0 && Date.now() - aiSpeakingStartTime < 700) {
      console.log(`[MediaStream] Ignoring interruption within echo guard window (${Date.now() - aiSpeakingStartTime}ms).`);
      return;
    }

    // Ignore very brief single-word background noise or coughs during AI playback
    if (callerText && callerText.trim().length < 4) {
      console.log(`[MediaStream] Ignoring brief utterance ("${callerText}") during AI playback.`);
      return;
    }

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
    aiSpeakingStartTime = 0;
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
      // Sanitize phone numbers and numbers: remove commas, semicolons between digits
      const sanitized = sanitizeDigitSpeech(sentence);
      if (!sanitized) return;

      console.log(`[AI] ${label} sentence ${++sentenceIndex}: "${sanitized}"`);
      isAISpeaking = true;
      if (!aiSpeakingStartTime) aiSpeakingStartTime = Date.now();

      try {
        const pcmBuffer = await getElevenLabsVoiceStream(
          sanitized,
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
          aiSpeakingStartTime = 0;
          activeAbortController = null;
        }
      }, totalPlaybackMs + 400);
    } else if (!controller.signal.aborted) {
      isAISpeaking = false;
      aiSpeakingStartTime = 0;
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
        const callerPhone = data.start.customParameters?.caller_phone || "";
        if (callRecordId) callSid = callRecordId;

        console.log(
          `[MediaStream] Started stream ${streamSid} for Call ${callSid.substring(0, 8)}... Caller Name: "${callerName}", Phone: "${callerPhone}"`,
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

        // Apply caller name and phone placeholder replacements
        const normalizedName = callerName ? callerName.trim() : "";
        const normalizedPhone = callerPhone ? callerPhone.trim() : "";
        if (assistant) {
          (assistant as any).caller_phone = normalizedPhone;
          let updatedPrompt = assistant.system_prompt
            .replace(/\{name\}/gi, normalizedName || "the caller")
            .replace(/\[name\]/gi, normalizedName || "the caller")
            .replace(/\(name\)/gi, normalizedName || "the caller");

          if (normalizedPhone) {
            const cleanDigits = normalizedPhone.replace(/[^0-9+]/g, "");
            updatedPrompt = updatedPrompt
              .replace(/\{phone\}/gi, cleanDigits)
              .replace(/\[phone\]/gi, cleanDigits)
              .replace(/\{caller_phone\}/gi, cleanDigits);
            updatedPrompt += `\n[CURRENT CALLER PHONE: ${cleanDigits} — The caller is already connected on this line. Directly offer to confirm their booking with this current calling number (e.g. "क्या मैं इसे आपके इसी नंबर पर बुक कर दूँ?") instead of asking them to recite digits.]`;
          }

          assistant = {
            ...assistant,
            system_prompt: updatedPrompt,
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

        // Load QAs, KB Documents, and Active Business Services
        try {
          const [qas, docs, servicesRes] = await Promise.all([
            getAssistantQAs(assistantId),
            getAssistantKBDocuments(assistantId),
            (assistant as any)?.user_id
              ? (supabaseAdmin as any)
                  .from("services")
                  .select("name, price, duration_minutes, description")
                  .eq("user_id", (assistant as any).user_id)
                  .eq("is_active", true)
              : Promise.resolve({ data: [] }),
          ]);
          cachedQAs = qas;
          kbDocs = docs;

          const activeServices = servicesRes?.data || [];
          if (activeServices.length > 0 && assistant) {
            const serviceSummary = activeServices
              .map((s: any) => `- ${s.name}${s.price ? ` (₹${s.price})` : ""}${s.description ? `: ${s.description}` : ""}`)
              .join("\n");
            assistant.system_prompt += `\n\n[AVAILABLE SERVICES OFFERED BY THIS BUSINESS:\n${serviceSummary}\nRULE: When the caller asks about services or when you ask which service they need, ALWAYS tell them what services are available with you from this list so they know their options.]`;
            console.log(
              `[MediaStream] Injected ${activeServices.length} active services into prompt for Call ${callSid.substring(0, 8)}.`,
            );
          }

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
              saveCallTranscriptTurn(callSid, "ai", firstMsg, turnIndex++).catch(() => {});
              broadcastTranscription(callSid, "ai", firstMsg);

              const firstMsgController = new AbortController();
              activeAbortController = firstMsgController;
              isAISpeaking = true;
              aiSpeakingStartTime = Date.now();

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
                    aiSpeakingStartTime = 0;
                    activeAbortController = null;
                  }
                }, playbackMs + 400);
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
          let callerTurnDebounceTimer: NodeJS.Timeout | null = null;
          let callerAccumulatedText = "";

          const handleCallerFinalUtterance = async (fullText: string) => {
            if (callEnded || !assistant) return;
            const cleanedText = sanitizeDigitSpeech(fullText);
            console.log(`[Caller] Says (final turn): "${cleanedText}"`);

            interruptAI(cleanedText);

            saveCallTranscriptTurn(callSid, "caller", cleanedText, turnIndex++).catch(() => {});
            conversationHistory.push({ speaker: "caller", text: cleanedText });
            broadcastTranscription(callSid, "caller", cleanedText);

            const turnController = new AbortController();
            activeAbortController = turnController;

            try {
              // 1. Fast-path: QA cache lookup
              let matchedAnswer = "";
              let bestScore = 0;
              let bestQA: any = null;

              for (const qa of cachedQAs) {
                const score = calculateSimilarity(fullText, qa.question);
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
                aiSpeakingStartTime = Date.now();
                console.log(`[AI] Cache Answer: "${matchedAnswer}"`);
                saveCallTranscriptTurn(callSid, "ai", matchedAnswer, turnIndex++).catch(() => {});
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
                      aiSpeakingStartTime = 0;
                      activeAbortController = null;
                    }
                  }, playbackMs + 400);
                }
                return;
              }

              // 2. Cache miss — KB injection + LLM with sentence-level streaming
              console.log(`[Cache Miss] Streaming LLM response.`);

              let kbContext = "";
              if (kbDocs.length > 0) {
                const lowerText = fullText.toLowerCase();
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
                  text: `${fullText}\n\n[CONTEXT:\n${kbContext}\n]`,
                };
              }

              if (assistant) {
                (assistant as any).active_call_id = callSid;
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
                saveCallTranscriptTurn(callSid, "ai", fullReplyText, turnIndex++).catch(() => {});
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
                return;
              }
              console.warn(`[MediaStream] Non-fatal turn error for call ${callSid}:`, err?.message || err);
              try {
                const fallbackMsg = "I'm sorry, I didn't quite catch that. Could you please repeat?";
                const pcmBuffer = await getElevenLabsVoiceStream(
                  fallbackMsg,
                  assistant?.voice_id,
                  undefined,
                  (assistant as any)?.language,
                );
                if (!callEnded) {
                  sendAudioToTwilio(ws, streamSid, pcmBuffer);
                  saveCallTranscriptTurn(callSid, "ai", fallbackMsg, turnIndex++).catch(() => {});
                }
              } catch (speechErr) {
                console.warn("[MediaStream] Fallback speech error:", speechErr);
              }
            }
          };

          deepgramStream = await createDeepgramStream(
            (chunkText: string) => {
              if (callEnded || !assistant) return;
              const trimmed = chunkText.trim();
              if (!trimmed) return;

              callerAccumulatedText = callerAccumulatedText
                ? `${callerAccumulatedText} ${trimmed}`
                : trimmed;

              console.log(`[Caller] Chunk received: "${trimmed}" (buffered: "${callerAccumulatedText}")`);

              if (callerTurnDebounceTimer) clearTimeout(callerTurnDebounceTimer);
              callerTurnDebounceTimer = setTimeout(() => {
                const toProcess = callerAccumulatedText;
                callerAccumulatedText = "";
                callerTurnDebounceTimer = null;
                handleCallerFinalUtterance(toProcess);
              }, 350);
            },
            (err) => {
              console.warn(`[Deepgram] STT error (non-fatal, call continues): ${err?.message || err}`);
              deepgramStream = null;
            },
            (interimText: string) => {
              if (callEnded) return;
              const words = interimText.trim().split(/\s+/).filter(Boolean);
              if (words.length >= 3 && isAISpeaking) {
                console.log(`[Caller] Interim interrupt with >= 3 words: "${interimText}"`);
                interruptAI(interimText);
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
