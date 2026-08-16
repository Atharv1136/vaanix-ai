import OpenAI from "openai";
import type { Assistant, Tool } from "./supabase";
import { streamAIReplyWithFallback } from "./services/aiKeyPool";

let client: OpenAI | null = null;

export function getClient(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  const baseURL = process.env.NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY environment variable.");
  }
  if (!client) {
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

// Maps our assistant model IDs to default model IDs
export const NVIDIA_MODELS: Record<string, string> = {
  "nvidia/nemotron-70b": "meta/llama-3.1-8b-instruct",
  "nvidia/nemotron-mini": "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-8b": "meta/llama-3.1-8b-instruct",
  "meta/llama-3.3-70b": "meta/llama-3.1-8b-instruct",
  "mistralai/mistral-7b": "meta/llama-3.1-8b-instruct",
};

/**
 * Streams AI reply during telephone call using the AI Key Pool with automatic multi-provider fallback.
 */
export async function* getAIReplyStream(
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
  yield* streamAIReplyWithFallback(assistant, tools, history, signal);
}
