/** Quick-block date logic. Plain date arithmetic on local values, so the browser needn't load Temporal. */

export type BlockLength = "30" | "60" | "120" | "rest";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local end of a block starting at `startMin` on `date`. "rest" ends at the following midnight. */
export function blockEnd(date: string, startMin: number, length: BlockLength): { end_date: string; end_time: string } {
  const total = length === "rest" ? 1440 : startMin + Number(length);
  const [y, m, d] = date.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + Math.floor(total / 1440)));
  const minutes = total % 1440;
  return { end_date: end.toISOString().slice(0, 10), end_time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
}

/** Whether the half hour starting at `min` can still be blocked. The half hour in progress counts. */
export function isBlockable(date: string, min: number, today: string, nowMin: number): boolean {
  return date > today || (date === today && min + 30 > nowMin);
}

/** Where a day's "Block time" button starts: null when the day is over. */
export function nextBlockStart(date: string, today: string, nowMin: number, firstBandStart: number | undefined): number | null {
  if (date < today) return null;
  if (date > today) return firstBandStart ?? 540;
  const next = Math.ceil(nowMin / 30) * 30;
  return next >= 1440 ? null : next;
}
