import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceLine = {
  ledger_entry_id: number;
  entry_type: "consultation_earning" | "refund_reversal" | "adjustment" | "payout";
  amount: number;
  gross_amount: number | null;
  commission_amount: number | null;
  reference: string | null;
  start_at: string | null;
  mode: string | null;
  patient_name: string | null;
};

export type InvoiceData = {
  id: string;
  doctor_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  amount: number;
  gross_amount: number;
  tds_rate_bps: number;
  tds_amount: number;
  /** Masked snapshot: account_masked, pan_masked, routing_masked, tax_id_masked plus non-secret fields. */
  bank: Record<string, string | null>;
  rejection_reason: string | null;
  transaction_reference: string | null;
  payout_method: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  doctor: { title: string; display_name: string; registration_number: string | null; registration_council: string | null } | null;
  lines: InvoiceLine[];
  billing: { company_name?: string; address?: string; gstin?: string; pan?: string; email?: string };
};

/** One invoice with its lines, read as the signed-in user (RLS: the doctor or finance admins). */
export async function getInvoice(id: string): Promise<InvoiceData | null> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("doctor_payouts")
    .select(
      `id, doctor_id, invoice_number, status, currency, amount, gross_amount, tds_rate_bps, tds_amount, rejection_reason,
       transaction_reference, payout_method, submitted_at, approved_at, paid_at, source,
       doctor_profiles(title, display_name, registration_number, registration_council)`,
    )
    .eq("id", id)
    .eq("source", "invoice")
    .maybeSingle();
  if (!p) return null;

  const [{ data: items }, { data: billing }, { data: bank }] = await Promise.all([
    supabase
      .from("payout_items")
      .select("financial_ledger_entries(id, entry_type, amount, gross_amount, commission_amount, appointments(reference, start_at, mode, patient_profiles(profiles(full_name))))")
      .eq("payout_id", id),
    supabase.from("platform_settings").select("value").eq("key", "billing").maybeSingle(),
    // Masked copy of the bank details the invoice was raised with (full numbers only via audited reveal).
    supabase.rpc("invoice_bank_masked", { p_payout: id }),
  ]);

  type RawLine = {
    id: number; entry_type: InvoiceLine["entry_type"]; amount: number; gross_amount: number | null; commission_amount: number | null;
    appointments: { reference: string; start_at: string; mode: string; patient_profiles: { profiles: { full_name: string | null } | null } | null } | null;
  };
  const lines = ((items ?? []) as unknown as { financial_ledger_entries: RawLine | null }[])
    .map((i) => i.financial_ledger_entries)
    .filter((l): l is RawLine => l !== null)
    .map((l) => ({
      ledger_entry_id: l.id,
      entry_type: l.entry_type,
      amount: l.amount,
      gross_amount: l.gross_amount,
      commission_amount: l.commission_amount,
      reference: l.appointments?.reference ?? null,
      start_at: l.appointments?.start_at ?? null,
      mode: l.appointments?.mode ?? null,
      patient_name: l.appointments?.patient_profiles?.profiles?.full_name ?? null,
    }))
    .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? "") || a.ledger_entry_id - b.ledger_entry_id);

  return {
    ...(p as unknown as Omit<InvoiceData, "doctor" | "lines" | "billing" | "bank">),
    bank: (bank ?? {}) as Record<string, string | null>,
    gross_amount: p.gross_amount ?? p.amount,
    doctor: (p.doctor_profiles as unknown as InvoiceData["doctor"]) ?? null,
    lines,
    billing: (billing?.value ?? {}) as InvoiceData["billing"],
  };
}
