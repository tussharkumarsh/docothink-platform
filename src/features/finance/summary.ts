/**
 * Earnings summaries computed from ledger rows the viewer is allowed to read (RLS).
 * Pure function: amounts in minor units, grouped by currency (no FX across currencies).
 */
export type LedgerRow = {
  id: number;
  doctor_id: string;
  entry_type: "consultation_earning" | "refund_reversal" | "adjustment" | "payout";
  currency: string;
  amount: number;
  gross_amount: number | null;
  commission_amount: number | null;
  created_at: string;
  in_payout: boolean;
};

export type PayoutRow = { status: string; amount: number; currency: string; tds_amount?: number | null };

export type CurrencySummary = {
  currency: string;
  consultations: number;
  gross: number;
  commission: number;
  net: number;
  pendingSettlement: number;
  approved: number;
  paid: number;
  inReview: number;
  /** TDS deducted from paid invoices (net was paid; this part goes to the tax authority). */
  tdsWithheld: number;
};

export function summarise(ledger: LedgerRow[], payouts: PayoutRow[]): CurrencySummary[] {
  const by = new Map<string, CurrencySummary>();
  const get = (c: string) => {
    let s = by.get(c);
    if (!s) by.set(c, (s = { currency: c, consultations: 0, gross: 0, commission: 0, net: 0, pendingSettlement: 0, approved: 0, paid: 0, inReview: 0, tdsWithheld: 0 }));
    return s;
  };
  for (const e of ledger) {
    const s = get(e.currency);
    if (e.entry_type === "payout") continue;
    if (e.entry_type === "consultation_earning") s.consultations++;
    s.gross += e.gross_amount ?? 0;
    s.commission += e.commission_amount ?? 0;
    s.net += e.amount;
    if (!e.in_payout) s.pendingSettlement += e.amount;
  }
  for (const p of payouts) {
    const s = get(p.currency);
    if (p.status === "paid") {
      s.paid += p.amount;
      s.tdsWithheld += p.tds_amount ?? 0;
    }
    else if (p.status === "approved" || p.status === "processing") s.approved += p.amount;
    else if (p.status === "pending" || p.status === "under_review" || p.status === "on_hold") s.inReview += p.amount;
  }
  return [...by.values()];
}

export function monthly(ledger: LedgerRow[], timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" });
  const map = new Map<string, { month: string; currency: string; net: number; count: number }>();
  for (const e of ledger) {
    if (e.entry_type === "payout") continue;
    const month = fmt.format(new Date(e.created_at));
    const key = `${month}|${e.currency}`;
    const row = map.get(key) ?? { month, currency: e.currency, net: 0, count: 0 };
    row.net += e.amount;
    if (e.entry_type === "consultation_earning") row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}
