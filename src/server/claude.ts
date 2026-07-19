import Anthropic from "@anthropic-ai/sdk";
import type { Assistant, Tool } from "./supabase";
import { executeTool } from "./services/toolExecutor";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function* getClaudeReplyStream(
  assistant: Assistant,
  tools: Tool[],
  history: { speaker: "caller" | "ai" | "tool"; text?: string; tool_calls?: any[]; tool_results?: any[] }[]
): AsyncGenerator<string, void, unknown> {
  const anthropic = getClient();

  const systemPrompt = `${assistant.system_prompt}
  
CRITICAL INSTRUCTION: Keep your spoken turns brief. You are on a live voice call. Do not output markdown, bullet points, or complex formatting, as it will be spoken by a text-to-speech engine.`;

  // Map our database tools to Anthropic tool schema
  const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
    name: t.name,
    description: t.description || "",
    input_schema: (t.config_json as any)?.input_schema || {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query or input for the tool"
        }
      }
    }
  }));

  // Map internal history to Anthropic messages
  const messages: Anthropic.MessageParam[] = [];
  
  for (const turn of history) {
    if (turn.speaker === "caller") {
      messages.push({ role: "user", content: turn.text || "" });
    } else if (turn.speaker === "ai") {
      const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
      if (turn.text) {
         content.push({ type: "text", text: turn.text });
      }
      if (turn.tool_calls && turn.tool_calls.length > 0) {
         for (const tc of turn.tool_calls) {
            content.push({
               type: "tool_use",
               id: tc.id,
               name: tc.name,
               input: tc.input
            });
         }
      }
      // Only push if there's content to avoid empty message errors
      if (content.length > 0) {
         messages.push({ role: "assistant", content });
      }
    } else if (turn.speaker === "tool") {
      if (turn.tool_results) {
         const content: Anthropic.ToolResultBlockParam[] = turn.tool_results.map(tr => ({
            type: "tool_result",
            tool_use_id: tr.tool_use_id,
            content: tr.content
         }));
         messages.push({ role: "user", content });
      }
    }
  }

  // We loop to handle tool executions until Claude replies with text
  let loopCount = 0;
  let finalResponseComplete = false;

  while (!finalResponseComplete && loopCount < 5) {
    loopCount++;
    try {
      const stream = await anthropic.messages.create({
        model: assistant.model || "claude-3-haiku-20240307",
        system: systemPrompt,
        messages: messages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        max_tokens: 500,
        stream: true,
      });

      let currentText = "";
      const currentToolCalls: { id: string; name: string; input: string }[] = [];
      let currentToolIndex = -1;

      for await (const chunk of stream) {
        if (chunk.type === "content_block_start") {
          if (chunk.content_block.type === "tool_use") {
            currentToolIndex++;
            currentToolCalls[currentToolIndex] = {
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: ""
            };
          }
        } else if (chunk.type === "content_block_delta") {
          if (chunk.delta.type === "text_delta") {
            currentText += chunk.delta.text;
            yield chunk.delta.text;
          } else if (chunk.delta.type === "input_json_delta") {
            if (currentToolIndex >= 0) {
               currentToolCalls[currentToolIndex].input += chunk.delta.input;
            }
          }
        }
      }

      if (currentToolCalls.length > 0) {
        // Claude wants to call tools.
        const parsedToolCalls = currentToolCalls.map(tc => ({
           id: tc.id,
           name: tc.name,
           input: JSON.parse(tc.input || "{}")
        }));

        // Add assistant's tool use to history
        history.push({
           speaker: "ai",
           text: currentText || undefined,
           tool_calls: parsedToolCalls
        });
        messages.push({
           role: "assistant",
           content: [
              ...(currentText ? [{ type: "text" as const, text: currentText }] : []),
              ...parsedToolCalls.map(tc => ({
                 type: "tool_use" as const,
                 id: tc.id,
                 name: tc.name,
                 input: tc.input
              }))
           ]
        });

        // Execute tools
        const toolResults = [];
        for (const tc of parsedToolCalls) {
           const resultStr = await executeTool(tc.name, tc.input, tools);
           toolResults.push({
              tool_use_id: tc.id,
              content: resultStr
           });
        }

        // Add tool results to history
        history.push({
           speaker: "tool",
           tool_results: toolResults
        });
        messages.push({
           role: "user",
           content: toolResults.map(tr => ({
              type: "tool_result" as const,
              tool_use_id: tr.tool_use_id,
              content: tr.content
           }))
        });

      } else {
        // No tool calls, Claude gave a normal text response
        history.push({ speaker: "ai", text: currentText });
        finalResponseComplete = true;
      }
    } catch (error) {
      console.error("[Claude] Error in generation stream:", error);
      throw error;
    }
  }
}
