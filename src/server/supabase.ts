import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export type CallLine = Database["public"]["Tables"]["call_lines"]["Row"];
export type Call = Database["public"]["Tables"]["calls"]["Row"];
export type KBSection = Database["public"]["Tables"]["kb_sections"]["Row"];

export async function getCallLine(phoneNumber: string): Promise<CallLine | null> {
  const { data, error } = await supabaseAdmin
    .from("call_lines")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase] Error fetching line ${phoneNumber}:`, error);
    return null;
  }
  return data;
}

export async function getKnowledgeBase(): Promise<KBSection[]> {
  const { data, error } = await supabaseAdmin
    .from("kb_sections")
    .select("*");

  if (error) {
    console.error("[Supabase] Error fetching knowledge base:", error);
    return [];
  }
  return data ?? [];
}

export async function createCallRecord(studentNumber: string, direction: "inbound" | "outbound", lineId: string | null): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("calls")
    .insert({
      student_number: studentNumber,
      direction,
      line_id: lineId,
      outcome: "in_progress",
      started_at: new Date().toISOString(),
      flagged: false,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Supabase] Error creating call record:", error);
    return null;
  }
  return data.id;
}

export async function updateCallStatus(callId: string, durationSeconds: number, outcome: string, summary: string | null = null): Promise<void> {
  const { error } = await supabaseAdmin
    .from("calls")
    .update({
      duration_seconds: durationSeconds,
      outcome,
      ended_at: new Date().toISOString(),
      summary,
    })
    .eq("id", callId);

  if (error) {
    console.error(`[Supabase] Error updating call status for ${callId}:`, error);
  }
}

export async function saveCallTranscriptTurn(callId: string, speaker: "student" | "ai", text: string, turnIndex: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("call_transcripts")
    .insert({
      call_id: callId,
      speaker,
      text,
      turn_index: turnIndex,
      ts: new Date().toISOString(),
    });

  if (error) {
    console.error(`[Supabase] Error saving transcript turn for ${callId}:`, error);
  }
}

export async function incrementCommonQuery(questionText: string): Promise<void> {
  // Simple check for string match
  const { data, error } = await supabaseAdmin
    .from("common_queries")
    .select("*")
    .eq("question_text", questionText)
    .maybeSingle();

  if (error) {
    console.error("[Supabase] Error checking common queries:", error);
    return;
  }

  if (data) {
    await supabaseAdmin
      .from("common_queries")
      .update({
        count: data.count + 1,
        last_asked_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  } else {
    await supabaseAdmin
      .from("common_queries")
      .insert({
        question_text: questionText,
        count: 1,
        last_asked_at: new Date().toISOString(),
      });
  }
}
