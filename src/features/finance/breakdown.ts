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

/** The `count` calendar months ending at `endMonth` ("YYYY-MM"), oldest first; months without entries are zero. */
export function lastMonths(rows: { month: string; currency: string; net: number }[], currency: string, endMonth: string, count = 12) {
  const [y, m] = endMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month, net: rows.find((r) => r.month === month && r.currency === currency)?.net ?? 0 };
  });
}
