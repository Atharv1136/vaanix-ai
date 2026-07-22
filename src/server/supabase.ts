export { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Assistant = Database["public"]["Tables"]["assistants"]["Row"];
export type Tool = Database["public"]["Tables"]["tools"]["Row"];
export type PhoneNumber = Database["public"]["Tables"]["phone_numbers"]["Row"];
export type Call = Database["public"]["Tables"]["calls"]["Row"];
export type KBDocument = Database["public"]["Tables"]["kb_documents"]["Row"];
export type AssistantQA = Database["public"]["Tables"]["assistant_qas"]["Row"];

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

export async function getDefaultAssistantId(): Promise<string | null> {
  if (process.env.DEFAULT_ASSISTANT_ID) {
    return process.env.DEFAULT_ASSISTANT_ID;
  }

  try {
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settings && (settings as any).default_assistant_id) {
      return (settings as any).default_assistant_id;
    }
  } catch (err) {
    console.error("[Supabase] Error reading app_settings default_assistant_id:", err);
  }

  const { data: fallback } = await supabaseAdmin
    .from("assistants")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback?.id || null;
}

export async function setDefaultAssistantId(assistantId: string | null): Promise<boolean> {
  process.env.DEFAULT_ASSISTANT_ID = assistantId || "";

  try {
    const { data: existing } = await supabaseAdmin
      .from("app_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("app_settings")
        .update({ default_assistant_id: assistantId } as any)
        .eq("id", 1);
    } else {
      await supabaseAdmin
        .from("app_settings")
        .insert({ id: 1, default_assistant_id: assistantId } as any);
    }
    return true;
  } catch (err) {
    console.warn("[Supabase] Updated in-memory default assistant:", assistantId);
    return true;
  }
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

export async function getAssistantKBDocuments(assistantId: string): Promise<KBDocument[]> {
  const { data: atRows, error: atErr } = await supabaseAdmin
    .from("assistant_tools")
    .select("tool_id, tools(tool_type)")
    .eq("assistant_id", assistantId);

  if (atErr || !atRows) {
    console.error(`[Supabase] Error fetching assistant tools for ${assistantId}:`, atErr);
    return [];
  }

  const kbToolIds = atRows
    .filter((row: any) => row.tools?.tool_type === "knowledge_base")
    .map((row: any) => row.tool_id);

  if (kbToolIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("kb_documents")
    .select("*")
    .in("tool_id", kbToolIds);

  if (error) {
    console.error(`[Supabase] Error fetching KB docs for assistant ${assistantId}:`, error);
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

export async function getAssistantQAs(assistantId: string): Promise<AssistantQA[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_qas")
    .select("*")
    .eq("assistant_id", assistantId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[Supabase] Error fetching QAs for assistant ${assistantId}:`, error);
    return [];
  }
  return data ?? [];
}

export async function deleteAssistantQAs(assistantId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("assistant_qas")
    .delete()
    .eq("assistant_id", assistantId);

  if (error) {
    console.error(`[Supabase] Error deleting QAs for assistant ${assistantId}:`, error);
  }
}

export async function saveAssistantQAs(assistantId: string, qas: { question: string; answer: string }[]): Promise<void> {
  if (qas.length === 0) return;
  const payload = qas.map(qa => ({
    assistant_id: assistantId,
    question: qa.question,
    answer: qa.answer
  }));

  const { error } = await supabaseAdmin
    .from("assistant_qas")
    .insert(payload);

  if (error) {
    console.error(`[Supabase] Error saving QAs for assistant ${assistantId}:`, error);
    throw error;
  }
}
