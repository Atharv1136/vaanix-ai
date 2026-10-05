import { Request, Response } from "express";
import twilio from "twilio";
import { supabaseAdmin } from "../supabase";
import { AuthenticatedRequest } from "../middleware/auth";
import { getTelephonyCredentials } from "../twilioClient";

// POST /api/phone-numbers — manually add a phone number
export async function addPhoneNumber(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { phone_number, label } = req.body;
  const userId = req.userId;

  if (!phone_number || !label) {
    res.status(400).json({ error: "phone_number and label are required." });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("phone_numbers")
    .insert({ phone_number, label, user_id: userId } as any)
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
}

// POST /api/phone-numbers/sync — sync from Twilio account
export async function syncPhoneNumbers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const creds = await getTelephonyCredentials(userId);
  const accountSid = creds.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = creds.authToken || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    res.status(500).json({ error: "Twilio credentials not configured. Please configure them in Settings." });
    return;
  }

  try {
    const client = twilio(accountSid, authToken);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });

    let synced = 0;
    const syncedNumbers: any[] = [];

    for (const n of numbers) {
      // Check if already exists for this user by twilio_sid or phone_number
      const { data: existing } = await supabaseAdmin
        .from("phone_numbers")
        .select("id")
        .eq("user_id" as any, userId)
        .or(`twilio_sid.eq.${n.sid},phone_number.eq.${n.phoneNumber}`)
        .maybeSingle();

      if (existing) {
        // Update label
        const { data: updated } = await supabaseAdmin
          .from("phone_numbers")
          .update({ label: n.friendlyName || n.phoneNumber, phone_number: n.phoneNumber, twilio_sid: n.sid } as any)
          .eq("id", existing.id)
          .select()
          .single();
        if (updated) syncedNumbers.push(updated);
      } else {
        const { data: inserted } = await supabaseAdmin
          .from("phone_numbers")
          .insert({
            user_id: userId,
            twilio_sid: n.sid,
            phone_number: n.phoneNumber,
            label: n.friendlyName || n.phoneNumber,
          } as any)
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
export async function uploadKbDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { assistantId } = req.params as { assistantId: string };
  const { title, content } = req.body;
  const userId = req.userId;

  if (!title || !content) {
    res.status(400).json({ error: "title and content are required." });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Verify assistant ownership
    const { data: assistant, error: assErr } = await supabaseAdmin
      .from("assistants")
      .select("id, user_id")
      .eq("id", assistantId)
      .eq("user_id" as any, userId)
      .maybeSingle();

    if (assErr || !assistant) {
      res.status(404).json({ error: "Assistant not found or not owned by you." });
      return;
    }

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
      // Create a new KB tool owned by the user and link it
      const { data: newTool, error: toolErr } = await supabaseAdmin
        .from("tools")
        .insert({
          user_id: userId,
          name: "Knowledge Base",
          description: "Uploaded knowledge base documents",
          tool_type: "knowledge_base"
        } as any)
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
export async function getKbDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { assistantId } = req.params as { assistantId: string };
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify assistant ownership
  const { data: assistant } = await supabaseAdmin
    .from("assistants")
    .select("id")
    .eq("id", assistantId)
    .eq("user_id" as any, userId)
    .maybeSingle();

  if (!assistant) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }

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
export async function deleteKbDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const docId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Ensure document belongs to a tool owned by this user
  const { data: doc } = await supabaseAdmin
    .from("kb_documents")
    .select("id, tools(user_id)")
    .eq("id", docId)
    .maybeSingle();

  if (!doc || (doc.tools as any)?.user_id !== userId) {
    res.status(404).json({ error: "Document not found or unauthorized" });
    return;
  }

  const { error } = await supabaseAdmin.from("kb_documents").delete().eq("id", docId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(204).send();
}

