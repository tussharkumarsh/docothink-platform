import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Only for webhooks, cron, the email outbox, signed URLs
 * and auth-admin calls, and only after the caller has done its own authorisation check.
 */
export function createAdminClient(): SupabaseClient {
  const key = serverEnv().supabaseSecretKey;
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error("Supabase service credentials are not configured (SUPABASE_SECRET_KEY).");
  }
  return createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous server client for public, cacheable reads (no cookies). */
export function createPublicClient(): SupabaseClient {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
