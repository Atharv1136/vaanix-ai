import { supabase } from "@/integrations/supabase/client";

/**
 * Enhanced fetch wrapper that automatically attaches the user's Supabase
 * access_token as a Bearer token in the Authorization header.
 */
export async function apiFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (err) {
    console.warn("[apiFetch] Failed to retrieve session token:", err);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

/**
 * Safely parse JSON from a fetch Response, preventing "Unexpected end of JSON input" errors.
 */
export async function safeJson<T = any>(res: Response): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return {
        ok: res.ok,
        status: res.status,
        data: {} as T,
        error: res.ok
          ? undefined
          : `Server returned HTTP ${res.status}. Please check if the telephony backend server is running.`,
      };
    }
    const data = JSON.parse(text);
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : (data?.error || `Request failed with status ${res.status}`),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: res.status,
      data: {} as T,
      error: `Invalid server response (${err.message})`,
    };
  }
}

