/** Settlement invoice helpers shared by doctor and admin screens. */

/** Same maths as public.submit_invoice(): TDS half-up on the gross, net = gross − TDS. */
export function invoiceTotals(entries: { amount: number }[], tdsRateBps: number, applyTds: boolean) {
  const gross = entries.reduce((sum, e) => sum + e.amount, 0);
  const tds = applyTds && gross > 0 ? Math.floor((gross * tdsRateBps + 5000) / 10000) : 0;
  return { gross, tds, net: gross - tds };
}

export function maskAccount(value: string | null | undefined): string {
  return value ? `••••${value.slice(-4)}` : "—";
}

export function maskPan(value: string | null | undefined): string {
  return value ? `${value.slice(0, 2)}••••${value.slice(-2)}` : "—";
}

export const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  pending: { label: "Submitted", tone: "info" },
  under_review: { label: "Under review", tone: "warning" },
  approved: { label: "Approved", tone: "warning" },
  processing: { label: "Processing", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Withdrawn", tone: "neutral" },
  on_hold: { label: "On hold", tone: "warning" },
};
