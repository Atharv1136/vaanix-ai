import { ActionContext, ActionResult } from "../types";
import { supabaseAdmin } from "../../supabase";
const db: any = supabaseAdmin;

export async function handleLookupFaq(
  input: { query: string },
  ctx: ActionContext
): Promise<ActionResult> {
  const query = input.query?.toLowerCase() || "";
  if (!query) {
    return {
      ok: false,
      error: "empty_query",
      message: "What specific information would you like me to look up?",
    };
  }

  try {
    // 1. Search assistant QAs
    let qaResults: any[] = [];
    if (ctx.agentId) {
      const { data } = await db
        .from("assistant_qas")
        .select("question, answer")
        .eq("assistant_id", ctx.agentId);

      if (data && data.length > 0) {
        qaResults = data.filter((item: any) => {
          const q = item.question?.toLowerCase() || "";
          const a = item.answer?.toLowerCase() || "";
          const words = query.split(" ").filter((w: string) => w.length > 2);
          return words.some((w: string) => q.includes(w) || a.includes(w));
        });
      }
    }

    if (qaResults.length > 0) {
      const best = qaResults[0];
      return {
        ok: true,
        message: best.answer,
        data: { found: true, answer: best.answer },
      };
    }

    // 2. Fall back to business profile details
    const { data: profile } = await db
      .from("business_profiles")
      .select("business_name, city, working_hours, timezone")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (query.includes("time") || query.includes("hour") || query.includes("open")) {
      return {
        ok: true,
        message: "We are open Monday through Friday from 10:00 AM to 8:00 PM, and Saturday from 10:00 AM to 2:00 PM.",
        data: { working_hours: profile?.working_hours },
      };
    }

    if (query.includes("where") || query.includes("location") || query.includes("address")) {
      const city = profile?.city || "our central branch";
      return {
        ok: true,
        message: `Our facility is conveniently located in ${city}. I can send the detailed address to your mobile phone if you like.`,
        data: { location: city },
      };
    }

    return {
      ok: true,
      message: "I will make a note of this question and ensure our staff provides you with the exact details.",
      data: { found: false },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      message: "Let me check with our reception team on that detail.",
    };
  }
}
