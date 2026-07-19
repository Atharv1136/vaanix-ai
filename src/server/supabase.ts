export { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Assistant = Database["public"]["Tables"]["assistants"]["Row"];
export type Tool = Database["public"]["Tables"]["tools"]["Row"];
export type PhoneNumber = Database["public"]["Tables"]["phone_numbers"]["Row"];
export type Call = Database["public"]["Tables"]["calls"]["Row"];
export type KBDocument = Database["public"]["Tables"]["kb_documents"]["Row"];

export async function getAssistant(assistantId: string): Promise<Assistant | null> {
  const { data, error } = await supabaseAdmin
    .from("assistants")
    .select("*")
    .eq("id", assistantId)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase] Error fetching assistant ${assistantId}:`, error);
    return null;
  }
  return data;
}

export async function getPhoneNumber(phoneNumber: string): Promise<PhoneNumber | null> {
  const { data, error } = await supabaseAdmin
    .from("phone_numbers")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase] Error fetching phone number ${phoneNumber}:`, error);
    return null;
  }
  return data;
}

export async function getAssistantTools(assistantId: string): Promise<Tool[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_tools")
    .select("tools(*)")
    .eq("assistant_id", assistantId)
    .eq("enabled", true);

  if (error) {
    console.error(`[Supabase] Error fetching tools for assistant ${assistantId}:`, error);
    return [];
  }
  return data.map((d: any) => d.tools).filter(Boolean);
}

export async function getKBDocuments(toolId: string): Promise<KBDocument[]> {
  const { data, error } = await supabaseAdmin
    .from("kb_documents")
    .select("*")
    .eq("tool_id", toolId);

  if (error) {
    console.error(`[Supabase] Error fetching KB documents for tool ${toolId}:`, error);
    return [];
  }
  return data ?? [];
}

export async function createCallRecord(
  assistantId: string,
  phoneNumberId: string | null,
  studentOrCallerNumber: string,
  direction: "inbound" | "outbound"
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("calls")
    .insert({
      assistant_id: assistantId,
      phone_number_id: phoneNumberId,
      student_or_caller_number: studentOrCallerNumber,
      direction,
      outcome: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Supabase] Error creating call record:", error);
    return null;
  }
  return data.id;
}

export async function updateCallStatus(
  callId: string,
  durationSeconds: number,
  outcome: string,
  costEstimate: number = 0
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("calls")
    .update({
      duration_seconds: durationSeconds,
      outcome,
      ended_at: new Date().toISOString(),
      cost_estimate: costEstimate,
    })
    .eq("id", callId);

  if (error) {
    console.error(`[Supabase] Error updating call status for ${callId}:`, error);
  }
}

export async function saveCallTranscriptTurn(
  callId: string,
  speaker: "caller" | "ai",
  text: string,
  turnIndex: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("call_transcripts")
    .insert({
      call_id: callId,
      speaker,
      text,
      turn_index: turnIndex,
      timestamp: new Date().toISOString(),
    });

  if (error) {
    console.error(`[Supabase] Error saving transcript turn for ${callId}:`, error);
  }
}
