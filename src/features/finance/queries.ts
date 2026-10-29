import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LedgerRow } from "./summary";

/** Ledger rows (RLS-scoped) with whether each is already attached to a payout. */
export async function getLedger(filter: { doctorId?: string; currency?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("financial_ledger_entries")
    .select("id, doctor_id, entry_type, currency, amount, gross_amount, commission_amount, description, created_at, appointment_id, payout_items(payout_id)")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 2000);
  if (filter.doctorId) query = query.eq("doctor_id", filter.doctorId);
  if (filter.currency) query = query.eq("currency", filter.currency);
  const { data, error } = await query;
  if (error) throw new Error("Could not load ledger");
  return (data ?? []).map((r) => ({
    ...(r as Omit<typeof r, "payout_items">),
    in_payout: Array.isArray(r.payout_items) ? r.payout_items.length > 0 : Boolean(r.payout_items),
  })) as (LedgerRow & { description: string; appointment_id: string | null })[];
}
