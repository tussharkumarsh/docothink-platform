/** Net earnings per consultation type (chat / audio / video) in one currency, largest first. */
export function byMode(rows: { entry_type: string; amount: number; currency: string; mode?: string | null }[], currency: string) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.currency !== currency || !r.mode) continue;
    if (r.entry_type !== "consultation_earning" && r.entry_type !== "refund_reversal") continue;
    totals.set(r.mode, (totals.get(r.mode) ?? 0) + r.amount);
  }
  return [...totals].map(([mode, net]) => ({ mode, net })).sort((a, b) => b.net - a.net);
}
