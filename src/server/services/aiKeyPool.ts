/**
 * AI Provider Key Pool — BYOK (Bring Your Own Key) service
 *
 * Manages a pool of user-configured AI provider API keys with:
 * - Priority-based ordering (lower priority number = tried first)
 * - Automatic fallback when a key fails
 * - Google Gemini, OpenAI, Groq, NVIDIA, Anthropic, Together AI support
 * - Real-time streaming fallback for live telephone calls
 * - Token usage tracking (stored in ai_provider_keys table)
 * - Cost estimation per provider + model
 */
import OpenAI from "openai";
import { supabaseAdmin, Assistant, Tool } from "../supabase";
import { executeTool } from "./toolExecutor";

// Cast to bypass Supabase generated types for new tables
const db = supabaseAdmin as any;

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface AiProviderKey {
  id: string;
  provider: string;
  label: string;
  api_key: string;
  base_url?: string;
  model_override?: string;
  is_active: boolean;
  priority: number;
  estimated_tokens_used: number;
  estimated_cost_usd: number;
  last_used_at?: string;
}

export interface CompletionResult {
  text: string;
  keyId: string;
  provider: string;
  tokensUsed: number;
}

// ─── Cost estimates (USD per 1K tokens) ───────────────────────────────────────
export const COST_PER_1K: Record<string, { input: number; output: number }> = {
  gemini:     { input: 0.000075, output: 0.0003 },
  openai:     { input: 0.0015,   output: 0.002 },
  anthropic:  { input: 0.008,    output: 0.024 },
  groq:       { input: 0.0001,   output: 0.0001 },
  openrouter: { input: 0.0015,   output: 0.002 },
  together:   { input: 0.0008,   output: 0.0008 },
  nvidia:     { input: 0.0008,   output: 0.0008 },
  custom:     { input: 0.001,    output: 0.001 },
};

// ─── Provider base URLs ────────────────────────────────────────────────────────
export const PROVIDER_BASE_URLS: Record<string, string> = {
  gemini:     "https://generativelanguage.googleapis.com/v1beta/openai",
  openai:     "https://api.openai.com/v1",
  anthropic:  "https://api.anthropic.com/v1",
  groq:       "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together:   "https://api.together.xyz/v1",
  nvidia:     "https://integrate.api.nvidia.com/v1",
};

// Default model per provider
export const DEFAULT_MODELS: Record<string, string> = {
  gemini:     "gemini-1.5-flash",
  openai:     "gpt-4o-mini",
  anthropic:  "claude-3-haiku-20240307",
  groq:       "groq/compound-mini",
  openrouter: "openai/gpt-4o-mini",
  together:   "meta-llama/Llama-3-8b-chat-hf",
  nvidia:     "meta/llama-3.1-8b-instruct",
  custom:     "gpt-4o-mini",
};

/**
 * Fetch all active keys ordered by priority from DB.
 */
export async function getActiveKeys(): Promise<AiProviderKey[]> {
  const { data, error } = await db
    .from("ai_provider_keys")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) {
    console.error("[AiKeyPool] Failed to fetch keys:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Record token usage for a key after a successful call.
 */
async function recordUsage(keyId: string, tokens: number, costUsd: number): Promise<void> {
  if (keyId.startsWith("env-")) return; // skip recording for system .env fallback
  const { data: key } = await db
    .from("ai_provider_keys")
    .select("estimated_tokens_used, estimated_cost_usd")
    .eq("id", keyId)
    .maybeSingle();

  if (!key) return;

  await db
    .from("ai_provider_keys")
    .update({
      estimated_tokens_used: (key.estimated_tokens_used || 0) + tokens,
      estimated_cost_usd: parseFloat(((key.estimated_cost_usd || 0) + costUsd).toFixed(6)),
      last_used_at: new Date().toISOString(),
    })
    .eq("id", keyId);
}

/**
 * Build a list of candidate keys including system .env fallbacks.
 *
 * Priority order for .env system keys (lower number = tried first):
 *   990 Groq       (fastest, generous free tier)
 *   991 Gemini     (free tier 15 RPM)
 *   992 Together   ($1 free credit)
 *   999 NVIDIA     (kept last — may be expired; replaced by above)
 *
 * To activate any of these, add the corresponding env var to .env or
 * the production environment (e.g. Render dashboard).
 */
export async function getCandidateKeys(explicitKeys?: AiProviderKey[]): Promise<AiProviderKey[]> {
  const activeKeys = [...(explicitKeys ?? (await getActiveKeys()))];

  // Only inject .env system fallbacks when no user-configured BYOK keys exist
  if (activeKeys.length === 0) {
    // ── Groq fallback (recommended: fast, free, OpenAI-compatible) ──────────
    if (process.env.GROQ_API_KEY) {
      activeKeys.push({
        id: "env-groq-key",
        provider: "groq",
        label: "System Groq Key (.env)",
        api_key: process.env.GROQ_API_KEY,
        base_url: "https://api.groq.com/openai/v1",
        model_override: "groq/compound-mini",
        is_active: true,
        priority: 990,
        estimated_tokens_used: 0,
        estimated_cost_usd: 0,
      });
    }

    // ── Google Gemini fallback (free tier: 15 RPM) ───────────────────────────
    if (process.env.GEMINI_API_KEY) {
      activeKeys.push({
        id: "env-gemini-key",
        provider: "gemini",
        label: "System Gemini Key (.env)",
        api_key: process.env.GEMINI_API_KEY,
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        model_override: "gemini-1.5-flash",
        is_active: true,
        priority: 991,
        estimated_tokens_used: 0,
        estimated_cost_usd: 0,
      });
    }

    // ── Together AI fallback ─────────────────────────────────────────────────
    if (process.env.TOGETHER_API_KEY) {
      activeKeys.push({
        id: "env-together-key",
        provider: "together",
        label: "System Together AI Key (.env)",
        api_key: process.env.TOGETHER_API_KEY,
        base_url: "https://api.together.xyz/v1",
        model_override: "meta-llama/Llama-3-8b-chat-hf",
        is_active: true,
        priority: 992,
        estimated_tokens_used: 0,
        estimated_cost_usd: 0,
      });
    }

    // ── NVIDIA NIM fallback (kept for backwards compatibility) ───────────────
    if (process.env.NVIDIA_API_KEY) {
      activeKeys.push({
        id: "env-nvidia-key",
        provider: "nvidia",
        label: "System NVIDIA Key (.env)",
        api_key: process.env.NVIDIA_API_KEY,
        base_url: process.env.NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
        model_override: "meta/llama-3.1-8b-instruct",
        is_active: true,
        priority: 999,
        estimated_tokens_used: 0,
        estimated_cost_usd: 0,
      });
    }

    if (activeKeys.length === 0) {
      console.warn(
        "[AiKeyPool] ⚠️  No AI provider keys found! " +
        "Add keys via Settings → AI Provider Keys, or set one of these .env vars: " +
        "GROQ_API_KEY, GEMINI_API_KEY, TOGETHER_API_KEY, NVIDIA_API_KEY"
      );
    }
  }

  // Sort by priority ascending so lowest-priority-number key is tried first
  activeKeys.sort((a, b) => a.priority - b.priority);

  return activeKeys;
}

/**
 * Call the OpenAI-compatible /chat/completions API.
 * Works for: gemini, openai, groq, openrouter, together, nvidia, and any custom base_url.
 */
async function callOpenAICompatible(
  key: AiProviderKey,
  messages: { role: string; content: string }[],
  model: string,
): Promise<{ text: string; tokensUsed: number }> {
  const baseUrl = key.base_url || PROVIDER_BASE_URLS[key.provider] || PROVIDER_BASE_URLS.openai;
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key.api_key}`,
  };

  // OpenRouter requires extra headers
  if (key.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://campusconnect.ai";
    headers["X-Title"] = "CampusConnect AI";
  }

  const body = {
    model,
    messages,
    max_tokens: 512,
    temperature: 0.3,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${key.provider} API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const tokensUsed = data.usage?.total_tokens ?? Math.ceil(text.length / 4);
  return { text, tokensUsed };
}

/**
 * Call Anthropic's native messages API.
 */
async function callAnthropic(
  key: AiProviderKey,
  messages: { role: string; content: string }[],
  model: string,
): Promise<{ text: string; tokensUsed: number }> {
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMsgs = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemMsg,
      messages: userMsgs,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? "";
  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokensUsed };
}

/**
 * Fallback chain — tries each key in priority order until one succeeds.
 * Returns the generated text and which key was used.
 */
export async function completionWithFallback(
  messages: { role: string; content: string }[],
  keys?: AiProviderKey[],
): Promise<CompletionResult> {
  const activeKeys = await getCandidateKeys(keys);

  if (activeKeys.length === 0) {
    throw new Error("No AI provider keys configured. Add one in Settings → AI Provider Keys.");
  }

  let lastError: Error | null = null;

  for (const key of activeKeys) {
    const model = key.model_override || DEFAULT_MODELS[key.provider] || "gpt-4o-mini";
    const costRates = COST_PER_1K[key.provider] ?? COST_PER_1K.custom;

    try {
      let result: { text: string; tokensUsed: number };

      if (key.provider === "anthropic") {
        result = await callAnthropic(key, messages, model);
      } else {
        result = await callOpenAICompatible(key, messages, model);
      }

      // Record usage
      const costUsd = (result.tokensUsed / 1000) * ((costRates.input + costRates.output) / 2);
      await recordUsage(key.id, result.tokensUsed, costUsd).catch(() => {});

      console.log(`[AiKeyPool] Success with ${key.provider}/${key.label} (${result.tokensUsed} tokens)`);
      return {
        text: result.text,
        keyId: key.id,
        provider: key.provider,
        tokensUsed: result.tokensUsed,
      };
    } catch (err: any) {
      console.warn(`[AiKeyPool] Key "${key.label}" (${key.provider}) failed: ${err.message}. Trying next…`);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All AI provider keys failed.");
}

/**
 * Real-time Streaming AI Reply generator with multi-provider fallback.
 * Uses the candidate keys in priority order (e.g. Gemini -> NVIDIA -> Groq -> OpenAI).
 * If a provider fails mid-stream or at initialization, it automatically falls back to the next key.
 */
export async function* streamAIReplyWithFallback(
  assistant: Assistant,
  tools: Tool[],
  history: {
    speaker: "caller" | "ai" | "tool";
    text?: string;
    tool_calls?: any[];
    tool_results?: any[];
  }[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const candidateKeys = await getCandidateKeys();

  const systemPrompt = `${assistant.system_prompt}

CRITICAL INSTRUCTION: You are on a live telephone call. Keep your reply to 1-2 short, natural sentences maximum. Be direct, helpful, and polite. Do NOT use markdown, bullet points, or numbered lists — your reply will be spoken aloud immediately.`;

  // Map tools to OpenAI schema
  const openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description || "",
      parameters: (t.config_json as any)?.input_schema || {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query or input for the tool",
          },
        },
        required: ["query"],
      },
    },
  }));

  // Build messages list
  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const turn of history) {
    if (turn.speaker === "caller") {
      baseMessages.push({ role: "user", content: turn.text || "" });
    } else if (turn.speaker === "ai") {
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        baseMessages.push({
          role: "assistant",
          content: turn.text || null,
          tool_calls: turn.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
            },
          })),
        });
      } else {
        baseMessages.push({ role: "assistant", content: turn.text || "" });
      }
    } else if (turn.speaker === "tool" && turn.tool_results) {
      for (const tr of turn.tool_results) {
        baseMessages.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: tr.content,
        });
      }
    }
  }

  let streamedAnyContent = false;
  let lastError: Error | null = null;

  for (const key of candidateKeys) {
    if (signal?.aborted) return;

    const baseUrl = key.base_url || PROVIDER_BASE_URLS[key.provider] || PROVIDER_BASE_URLS.openai;
    const model = key.model_override || DEFAULT_MODELS[key.provider] || "gpt-4o-mini";

    console.log(`[AiKeyPool] Attempting live call streaming with ${key.provider} (${key.label}) [model: ${model}]`);

    try {
      const client = new OpenAI({
        apiKey: key.api_key,
        baseURL: baseUrl.replace(/\/+$/, ""),
        defaultHeaders: key.provider === "openrouter" ? {
          "HTTP-Referer": "https://campusconnect.ai",
          "X-Title": "CampusConnect AI",
        } : undefined,
      });

      const messages = [...baseMessages];
      let loopCount = 0;
      let finalResponseComplete = false;

      while (!finalResponseComplete && loopCount < 4) {
        loopCount++;
        const stream = await client.chat.completions.create(
          {
            model,
            messages,
            tools: openAiTools.length > 0 ? openAiTools : undefined,
            tool_choice: openAiTools.length > 0 ? "auto" : undefined,
            max_tokens: 180,
            temperature: 0.4,
            stream: true,
          },
          { signal },
        );

        let currentText = "";
        let toolCalls: { id: string; name: string; args: string }[] = [];
        let currentToolIndex = -1;

        for await (const chunk of stream) {
          if (signal?.aborted) return;
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            currentText += delta.content;
            streamedAnyContent = true;
            yield delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined && tc.index !== currentToolIndex) {
                currentToolIndex = tc.index;
                toolCalls[currentToolIndex] = { id: "", name: "", args: "" };
              }
              if (tc.id) toolCalls[currentToolIndex].id = tc.id;
              if (tc.function?.name) toolCalls[currentToolIndex].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[currentToolIndex].args += tc.function.arguments;
            }
          }

          const finishReason = chunk.choices[0]?.finish_reason;
          if (finishReason === "stop" || finishReason === "length") {
            finalResponseComplete = true;
          }
        }

        // Handle tool calls
        if (toolCalls.length > 0 && toolCalls.some((tc) => tc.name)) {
          const parsedToolCalls = toolCalls
            .filter((tc) => tc.name)
            .map((tc) => ({
              id: tc.id || `tc_${Date.now()}`,
              name: tc.name,
              input: (() => {
                try {
                  return JSON.parse(tc.args || "{}");
                } catch {
                  return {};
                }
              })(),
            }));

          history.push({
            speaker: "ai",
            text: currentText || undefined,
            tool_calls: parsedToolCalls,
          });
          messages.push({
            role: "assistant",
            content: currentText || null,
            tool_calls: parsedToolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          });

          // Execute tools
          const toolResults = [];
          for (const tc of parsedToolCalls) {
            const resultStr = await executeTool(tc.name, tc.input, tools);
            toolResults.push({ tool_use_id: tc.id, content: resultStr });
          }

          history.push({ speaker: "tool", tool_results: toolResults });
          for (const tr of toolResults) {
            messages.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
          }

          finalResponseComplete = false; // Loop back for next response
        } else {
          if (currentText) {
            history.push({ speaker: "ai", text: currentText });
          }
          finalResponseComplete = true;
        }
      }

      // If we successfully reached here, record usage and finish generator
      const estimatedTokens = Math.ceil((systemPrompt.length + 100) / 4);
      const costRates = COST_PER_1K[key.provider] ?? COST_PER_1K.custom;
      const costUsd = (estimatedTokens / 1000) * ((costRates.input + costRates.output) / 2);
      recordUsage(key.id, estimatedTokens, costUsd).catch(() => {});

      return;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) {
        return;
      }
      console.warn(`[AiKeyPool] Provider "${key.provider}" failed in stream: ${err.message}. Trying next candidate…`);
      lastError = err;
      // If we already streamed partial content to the caller, don't re-attempt with another key to avoid stuttering
      if (streamedAnyContent) {
        return;
      }
    }
  }

  // Graceful fallback if all providers fail completely: speak a helpful polite sentence so call never hangs up
  if (!streamedAnyContent && !signal?.aborted) {
    console.error("[AiKeyPool] All AI providers failed during live call:", lastError?.message);
    const friendlyFallback = "I'm sorry, I'm having a brief connection difficulty. Could you please repeat what you said?";
    history.push({ speaker: "ai", text: friendlyFallback });
    yield friendlyFallback;
  }
}

/**
 * Test a single key with a trivial prompt to verify it works.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function testKey(key: AiProviderKey): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await completionWithFallback(
      [{ role: "user", content: "Say 'ok' and nothing else." }],
      [key],
    );
    return { ok: !!res.text };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
