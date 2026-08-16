import { Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { completionWithFallback, testKey, getActiveKeys } from "../services/aiKeyPool";
import type { AiProviderKey } from "../services/aiKeyPool";

const db = supabaseAdmin as any;

/**
 * POST /api/analytics/call-summary/:callId
 * Generates an AI summary of a call transcript and saves it to the calls table.
 */
export async function handleGenerateCallSummary(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;

  try {
    // Fetch call + transcript
    const [{ data: call }, { data: turns }] = await Promise.all([
      db.from("calls").select("*").eq("id", callId).maybeSingle(),
      db
        .from("call_transcripts")
        .select("speaker, text, turn_index")
        .eq("call_id", callId)
        .order("turn_index"),
    ]);

    if (!call) {
      res.status(404).json({ error: "Call not found." });
      return;
    }

    if (!turns || turns.length === 0) {
      res.status(400).json({ error: "No transcript available for this call." });
      return;
    }

    // Format transcript for the LLM
    const transcriptText = turns
      .map((t: any) => `${t.speaker === "ai" ? "AI Agent" : "Caller"}: ${t.text}`)
      .join("\n");

    const messages = [
      {
        role: "system",
        content:
          "You are a concise call analysis assistant. Summarize the key intent, outcome, and any important details of the conversation in 2-3 sentences. Focus on what the caller wanted, whether it was resolved, and any notable points. Write in third-person, past tense.",
      },
      {
        role: "user",
        content: `Summarize this call transcript:\n\n${transcriptText}`,
      },
    ];

    let summaryText = "";
    let providerName = "ai-key-pool";
    let tokens = 0;

    try {
      const result = await completionWithFallback(messages);
      summaryText = result.text;
      providerName = result.provider;
      tokens = result.tokensUsed;
    } catch (llmErr: any) {
      console.warn("[Analytics] LLM completion failed, generating heuristic transcript summary:", llmErr.message);
      const userTurns = turns.filter((t: any) => t.speaker !== "ai").map((t: any) => t.text).join(" ");
      summaryText = userTurns
        ? `Caller inquired about: "${userTurns.slice(0, 160)}...". Conversation completed with outcome: ${call.outcome}.`
        : `Call completed with AI assistant. Outcome recorded as ${call.outcome}.`;
      providerName = "heuristic-fallback";
    }

    // Determine sentiment from outcome
    const sentiment =
      call.outcome === "resolved"
        ? "positive"
        : call.outcome === "flagged"
        ? "negative"
        : "neutral";

    // Save summary to DB
    await db
      .from("calls")
      .update({
        ai_summary: summaryText,
        call_sentiment: sentiment,
      })
      .eq("id", callId);

    res.status(200).json({
      summary: summaryText,
      sentiment,
      provider: providerName,
      tokensUsed: tokens,
    });
  } catch (err: any) {
    console.error("[Analytics] Call summary endpoint error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/analytics/test-key
 * Tests an AI provider key with a simple prompt.
 * Body: { keyId: string }
 */
export async function handleTestAiKey(req: Request, res: Response): Promise<void> {
  const { keyId } = req.body;

  if (!keyId) {
    res.status(400).json({ error: "Missing keyId." });
    return;
  }

  const { data: key } = await db
    .from("ai_provider_keys")
    .select("*")
    .eq("id", keyId)
    .maybeSingle();

  if (!key) {
    res.status(404).json({ error: "Key not found." });
    return;
  }

  const result = await testKey(key as AiProviderKey);
  res.status(result.ok ? 200 : 400).json(result);
}

/**
 * GET /api/analytics/key-pool-stats
 * Returns aggregate stats across all AI provider keys.
 */
export async function handleGetKeyPoolStats(req: Request, res: Response): Promise<void> {
  try {
    const keys = await getActiveKeys();
    const totalTokens = keys.reduce((s, k) => s + (k.estimated_tokens_used || 0), 0);
    const totalCost = keys.reduce((s, k) => s + parseFloat(String(k.estimated_cost_usd || 0)), 0);
    res.status(200).json({
      keyCount: keys.length,
      totalTokensUsed: totalTokens,
      totalEstimatedCostUsd: parseFloat(totalCost.toFixed(6)),
      keys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        provider: k.provider,
        priority: k.priority,
        estimated_tokens_used: k.estimated_tokens_used,
        estimated_cost_usd: k.estimated_cost_usd,
        last_used_at: k.last_used_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
