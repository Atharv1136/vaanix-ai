import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../supabase";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Middleware that validates the Supabase Auth JWT in the Authorization header.
 * Attaches req.userId and req.userEmail to the request.
 */
export async function requireUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({ error: "Empty Bearer token provided" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
      return;
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err: any) {
    console.error("[AuthMiddleware] Error verifying user:", err.message);
    res.status(401).json({ error: "Unauthorized: Verification failed" });
  }
}
