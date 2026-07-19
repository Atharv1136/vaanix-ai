import OpenAI from "openai";
import type { Assistant, Tool } from "./supabase";
import { executeTool } from "./services/toolExecutor";

let client: OpenAI | null = null;

function getClient(): OpenAI {
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

// Maps our assistant model IDs to NVIDIA NIM model IDs
export const NVIDIA_MODELS: Record<string, string> = {
  "nvidia/nemotron-70b": "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/nemotron-mini": "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-8b": "meta/llama-3.1-8b-instruct",
  "meta/llama-3.3-70b": "nvidia/llama-3.3-nemotron-super-49b-v1",
  "mistralai/mistral-7b": "meta/llama-3.1-8b-instruct",
};

export async function* getAIReplyStream(
  assistant: Assistant,
  tools: Tool[],
  history: { speaker: "caller" | "ai" | "tool"; text?: string; tool_calls?: any[]; tool_results?: any[] }[]
): AsyncGenerator<string, void, unknown> {
  const openai = getClient();

  // Resolve model — fall back to nemotron-70b as default
  const modelId = NVIDIA_MODELS[assistant.model] || "nvidia/llama-3.3-nemotron-70b-instruct";

  const systemPrompt = `${assistant.system_prompt}

CRITICAL INSTRUCTION: Keep your spoken turns brief (1-3 sentences). You are on a live voice call. Do not output markdown, bullet points, numbered lists, or complex formatting — your response will be spoken aloud by a text-to-speech engine. Speak naturally and conversationally.`;

  // Map tools to OpenAI function-call schema
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

  // Convert internal history to OpenAI messages format
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const turn of history) {
    if (turn.speaker === "caller") {
      messages.push({ role: "user", content: turn.text || "" });
    } else if (turn.speaker === "ai") {
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        messages.push({
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
        messages.push({ role: "assistant", content: turn.text || "" });
      }
    } else if (turn.speaker === "tool" && turn.tool_results) {
      for (const tr of turn.tool_results) {
        messages.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: tr.content,
        });
      }
    }
  }

  // Tool-use loop — up to 5 iterations
  let loopCount = 0;
  let finalResponseComplete = false;

  while (!finalResponseComplete && loopCount < 5) {
    loopCount++;
    try {
      const stream = await openai.chat.completions.create({
        model: modelId,
        messages,
        tools: openAiTools.length > 0 ? openAiTools : undefined,
        tool_choice: openAiTools.length > 0 ? "auto" : undefined,
        max_tokens: 512,
        temperature: 0.6,
        stream: true,
      });

      let currentText = "";
      let toolCalls: { id: string; name: string; args: string }[] = [];
      let currentToolIndex = -1;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          currentText += delta.content;
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

      if (toolCalls.length > 0 && toolCalls.some((tc) => tc.name)) {
        // AI wants to call tools
        const parsedToolCalls = toolCalls
          .filter((tc) => tc.name)
          .map((tc) => ({
            id: tc.id || `tc_${Date.now()}`,
            name: tc.name,
            input: (() => { try { return JSON.parse(tc.args || "{}"); } catch { return {}; } })(),
          }));

        history.push({ speaker: "ai", text: currentText || undefined, tool_calls: parsedToolCalls });
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

        finalResponseComplete = false; // Loop back for AI's next response
      } else {
        // Normal text reply, no tool calls
        if (!finalResponseComplete) {
          history.push({ speaker: "ai", text: currentText });
          finalResponseComplete = true;
        } else {
          history.push({ speaker: "ai", text: currentText });
        }
      }
    } catch (error) {
      console.error("[NVIDIA NIM] Error in generation stream:", error);
      throw error;
    }
  }
}
