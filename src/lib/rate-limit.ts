import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

/**
 * Fixed-window limiter backed by Postgres (public.check_rate_limit), so it works across
 * serverless instances without Redis. Keys combine the action with the client IP (hashed by
 * the caller if needed). If the service key is not configured, limiting is skipped (dev only).
 */
export async function rateLimit(action: string, max: number, windowSeconds: number, subject?: string): Promise<boolean> {
  if (!serverEnv().supabaseSecretKey) return true;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = `${action}:${subject ?? ip}`;
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.code);
    return true; // fail open on infrastructure errors, never on policy
  }
  return data === true;
}
