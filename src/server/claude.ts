import Anthropic from "@anthropic-ai/sdk";
import type { KBSection } from "./supabase";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

export async function* getClaudeReplyStream(
  history: { speaker: "student" | "ai"; text: string }[],
  knowledgeBase: KBSection[]
): AsyncGenerator<string, void, unknown> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  // Format Knowledge Base text content
  const kbContext = knowledgeBase
    .map((kb) => `Category: ${kb.category}\nTitle: ${kb.title}\nContent: ${kb.content}\n---`)
    .join("\n");

  const systemPrompt = `
You are the CampusConnect AI Counselor for the college admission cell.
Answer the student's admission-related questions based STRICTLY on the knowledge base content below.
Keep your answers extremely brief: 1-3 short spoken sentences maximum.
Speak conversationally and naturally as if you are on a live voice phone call.

If the information to answer their question is not present in the knowledge base, do NOT invent or guess policy. Instead, say exactly: "I don't have that detail in my system, let me forward you to our admissions officer." and we will route the call.

Knowledge Base content:
${kbContext}
`;

  // Format dialogue history
  const messages = history.map((turn) => ({
    role: turn.speaker === "student" ? ("user" as const) : ("assistant" as const),
    content: turn.text,
  }));

  try {
    const stream = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 150,
      system: systemPrompt,
      messages: messages,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield chunk.delta.text;
      }
    }
  } catch (error) {
    console.error("[Claude] Error in generation stream:", error);
    throw error;
  }
}
