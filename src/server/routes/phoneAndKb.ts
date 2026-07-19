import { Request, Response } from "express";
import twilio from "twilio";
import { supabaseAdmin } from "../supabase";

// POST /api/phone-numbers — manually add a phone number
export async function addPhoneNumber(req: Request, res: Response): Promise<void> {
  const { phone_number, label } = req.body;
  if (!phone_number || !label) {
    res.status(400).json({ error: "phone_number and label are required." });
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("phone_numbers")
    .insert({ phone_number, label })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
}

// POST /api/phone-numbers/sync — sync from Twilio account
export async function syncPhoneNumbers(req: Request, res: Response): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    res.status(500).json({ error: "Twilio credentials not configured." });
    return;
  }

  try {
    const client = twilio(accountSid, authToken);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });

    let synced = 0;
    const syncedNumbers: any[] = [];

    for (const n of numbers) {
      // Check if already exists by twilio_sid
      const { data: existing } = await supabaseAdmin
        .from("phone_numbers")
        .select("id")
        .eq("twilio_sid", n.sid)
        .maybeSingle();

      if (existing) {
        // Update label
        const { data: updated } = await supabaseAdmin
          .from("phone_numbers")
          .update({ label: n.friendlyName || n.phoneNumber, phone_number: n.phoneNumber })
          .eq("id", existing.id)
          .select()
          .single();
        if (updated) syncedNumbers.push(updated);
      } else {
        const { data: inserted } = await supabaseAdmin
          .from("phone_numbers")
          .insert({ twilio_sid: n.sid, phone_number: n.phoneNumber, label: n.friendlyName || n.phoneNumber })
          .select()
          .single();
        if (inserted) { syncedNumbers.push(inserted); synced++; }
      }
    }

    res.json({ synced, numbers: syncedNumbers });

  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync from Twilio." });
  }
}

// POST /api/assistants/:id/kb-upload — upload a knowledge base document
export async function uploadKbDocument(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params as { assistantId: string };
  const { title, content } = req.body;

  if (!title || !content) {
    res.status(400).json({ error: "title and content are required." });
    return;
  }

  try {
    // Find or create a knowledge_base tool for this assistant
    let toolId: string | null = null;

    // Look for existing KB tool assigned to this assistant
    const { data: existingTool } = await supabaseAdmin
      .from("assistant_tools")
      .select("tool_id, tools(id, tool_type, name)")
      .eq("assistant_id", assistantId)
      .eq("tools.tool_type", "knowledge_base")
      .maybeSingle();

    if (existingTool?.tool_id) {
      toolId = existingTool.tool_id;
    } else {
      // Create a new KB tool and link it
      const { data: newTool, error: toolErr } = await supabaseAdmin
        .from("tools")
        .insert({ name: "Knowledge Base", description: "Uploaded knowledge base documents", tool_type: "knowledge_base" })
        .select()
        .single();
      if (toolErr || !newTool) {
        res.status(500).json({ error: toolErr?.message || "Failed to create KB tool." });
        return;
      }
      toolId = newTool.id;

      await supabaseAdmin
        .from("assistant_tools")
        .insert({ assistant_id: assistantId, tool_id: toolId, enabled: true });
    }

    // Insert the document
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("kb_documents")
      .insert({ tool_id: toolId, title, content })
      .select()
      .single();

    if (docErr) {
      res.status(500).json({ error: docErr.message });
      return;
    }

    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to upload document." });
  }
}

// GET /api/assistants/:id/kb-documents — get all KB docs for an assistant
export async function getKbDocuments(req: Request, res: Response): Promise<void> {
  const { assistantId } = req.params as { assistantId: string };

  const { data: atRows } = await supabaseAdmin
    .from("assistant_tools")
    .select("tool_id, tools(tool_type)")
    .eq("assistant_id", assistantId);

  const kbToolIds = (atRows || [])
    .filter((row: any) => row.tools?.tool_type === "knowledge_base")
    .map((row: any) => row.tool_id);

  if (kbToolIds.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("kb_documents")
    .select("*")
    .in("tool_id", kbToolIds)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
}

// DELETE /api/kb-documents/:id
export async function deleteKbDocument(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("kb_documents").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(204).send();
}
