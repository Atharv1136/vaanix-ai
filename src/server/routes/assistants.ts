import { Request, Response } from "express";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Middleware to check API key
export async function authenticateApiKey(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.substring(7);
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("*")
    .eq("key_hash", token)
    .maybeSingle();

  if (error || !data) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // Update last_used_at
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  (req as any).apiKeyUserId = (data as any).user_id;
  next();
}

export async function getAssistants(req: Request, res: Response) {
  const userId = (req as any).apiKeyUserId;
  let query = supabaseAdmin.from("assistants").select("*");
  if (userId) query = query.eq("user_id" as any, userId);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
}

export async function getAssistant(req: Request, res: Response) {
  const userId = (req as any).apiKeyUserId;
  const assistantId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] || "";
  let query = supabaseAdmin
    .from("assistants")
    .select("*")
    .eq("id", assistantId);

  if (userId) query = query.eq("user_id" as any, userId);

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  res.json(data);
}

export async function createAssistant(req: Request, res: Response) {
  const userId = (req as any).apiKeyUserId;
  const payload = { ...req.body };
  if (userId) payload.user_id = userId;

  const { data, error } = await supabaseAdmin
    .from("assistants")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
}

export async function updateAssistant(req: Request, res: Response) {
  const userId = (req as any).apiKeyUserId;
  const assistantId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] || "";
  let query = supabaseAdmin
    .from("assistants")
    .update(req.body)
    .eq("id", assistantId);

  if (userId) query = query.eq("user_id" as any, userId);

  const { data, error } = await query.select("*").single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
}

export async function deleteAssistant(req: Request, res: Response) {
  const userId = (req as any).apiKeyUserId;
  const assistantId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] || "";
  let query = supabaseAdmin
    .from("assistants")
    .delete()
    .eq("id", assistantId);

  if (userId) query = query.eq("user_id" as any, userId);

  const { error } = await query;

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(204).send();
}

