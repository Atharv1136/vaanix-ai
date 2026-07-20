import { Request, Response } from "express";
import {
  supabaseAdmin,
  getAssistant,
  getAssistantKBDocuments,
  getAssistantQAs,
  deleteAssistantQAs,
  saveAssistantQAs,
} from "../supabase";
import { getClient } from "../nvidia";

// GET /api/assistants/:assistantId/qas
export async function handleGetQAs(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params;
  try {
    const qas = await getAssistantQAs(assistantId);
    res.json(qas);
  } catch (error: any) {
    console.error("[QAs] Error getting QAs:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve QAs." });
  }
}

// POST /api/assistants/:assistantId/qas/generate
export async function handleGenerateQAs(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params;
  const { instruction } = req.body;

  try {
    const assistant = await getAssistant(assistantId);
    if (!assistant) {
      res.status(404).json({ error: "Assistant not found." });
      return;
    }

    const kbDocs = await getAssistantKBDocuments(assistantId);

    const openai = getClient();
    const systemPrompt = `You are a professional QA training assistant. Your job is to analyze the AI assistant configuration (System Prompt) and its Knowledge Base Documents to generate a JSON array of up to 50 commonly asked questions and their short, direct, spoken answers.
    
Rules for generation:
1. The generated questions must be queries that a real student, caller, or customer would ask (e.g., "What are the timings?", "How much does it cost?").
2. The answers must be conversational, concise (1-3 sentences), and formatted to be spoken aloud by a text-to-speech engine. Do not use markdown, bullet points, numbered lists, asterisks, or any complex formatting. Write numbers as words or standard numbers (e.g. "one hundred" or "100") that can be read out loud easily.
3. You must generate up to 50 distinct Q&As representing the core information. If there is limited context, generate at least 15-20 core Q&As.
4. Focus on the most common topics. If the user provided additional instructions, prioritize those guidelines (e.g. "focus on admissions fees").
5. The output format MUST be a valid JSON array of objects, where each object has exactly two keys: "question" and "answer".

Example Output Format:
[
  {
    "question": "What is the tuition fee for B.Tech?",
    "answer": "The tuition fee for B.Tech is one lakh forty-two thousand rupees per year."
  }
]

DO NOT output any introductory or concluding text, only output the raw JSON array.`;

    const userMessage = `Assistant Name: ${assistant.name}
System Prompt: ${assistant.system_prompt}

${instruction ? `User Guidelines for generation: ${instruction}` : ""}

Knowledge Base Documents:
${kbDocs.length > 0 ? kbDocs.map((d) => `--- ${d.title} ---\n${d.content}`).join("\n\n") : "No KB documents uploaded yet."}`;

    console.log(`[QAs] Generating QAs for assistant ${assistantId}...`);

    // Call NVIDIA NIM Model
    const completion = await openai.chat.completions.create({
      model: "nvidia/llama-3.3-nemotron-super-49b-v1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 4000,
    });

    let content = completion.choices[0]?.message?.content || "";

    // Clean codeblock wrapper if LLM returned it
    content = content
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    let parsedQas: { question: string; answer: string }[] = [];
    try {
      parsedQas = JSON.parse(content);
    } catch (parseErr) {
      console.error("[QAs] JSON parsing failed. Content was:", content);
      throw new Error("AI returned invalid JSON format. Please try again.");
    }

    if (!Array.isArray(parsedQas)) {
      throw new Error("AI did not return a JSON array. Please try again.");
    }

    // Save QAs to DB: first wipe old ones for this assistant, then bulk insert
    await deleteAssistantQAs(assistantId);
    await saveAssistantQAs(assistantId, parsedQas);

    console.log(
      `[QAs] Successfully generated and saved ${parsedQas.length} QAs for assistant ${assistantId}.`,
    );

    const freshQas = await getAssistantQAs(assistantId);
    res.json(freshQas);
  } catch (error: any) {
    console.error("[QAs] Error generating QAs:", error);
    res.status(500).json({ error: error.message || "Failed to generate QAs." });
  }
}

// POST /api/assistants/:assistantId/qas
export async function handleSaveQA(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params;
  const { id, question, answer } = req.body;

  if (!question || !answer) {
    res.status(400).json({ error: "question and answer are required." });
    return;
  }

  try {
    if (id) {
      // Update
      const { data, error } = await supabaseAdmin
        .from("assistant_qas")
        .update({ question, answer, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("assistant_id", assistantId)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      // Insert
      const { data, error } = await supabaseAdmin
        .from("assistant_qas")
        .insert({ assistant_id: assistantId, question, answer })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    }
  } catch (error: any) {
    console.error("[QAs] Error saving QA:", error);
    res.status(500).json({ error: error.message || "Failed to save QA." });
  }
}

// DELETE /api/qas/:id
export async function handleDeleteQA(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from("assistant_qas").delete().eq("id", id);

    if (error) throw error;
    res.status(204).send();
  } catch (error: any) {
    console.error("[QAs] Error deleting QA:", error);
    res.status(500).json({ error: error.message || "Failed to delete QA." });
  }
}

// POST /api/assistants/:assistantId/qas/bulk
export async function handleBulkSaveQAs(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params;
  const { qas } = req.body;

  if (!qas || !Array.isArray(qas)) {
    res.status(400).json({ error: "qas array is required." });
    return;
  }

  try {
    await deleteAssistantQAs(assistantId);
    if (qas.length > 0) {
      await saveAssistantQAs(assistantId, qas);
    }

    console.log(`[QAs] Successfully bulk saved ${qas.length} QAs for assistant ${assistantId}.`);

    const freshQas = await getAssistantQAs(assistantId);
    res.json(freshQas);
  } catch (error: any) {
    console.error("[QAs] Error bulk saving QAs:", error);
    res.status(500).json({ error: error.message || "Failed to bulk save QAs." });
  }
}
