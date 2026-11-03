import { Temporal } from "temporal-polyfill";
import { minutesOfDay, zonedInstant } from "@/lib/time/slots";

const DAY_MINUTES = 1440;
const DEFAULT_FROM = 7 * 60;
const DEFAULT_TO = 21 * 60;

export type Placed = {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  /** The whole item's range, even when this piece is one day of several. */
  startIso: string;
  endIso: string;
  column: number;
  columns: number;
};

function parseDate(value: string | null | undefined): Temporal.PlainDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return null;
  }
}

/** The Monday-to-Sunday week containing `param`, or `today` when it's missing or invalid. */
export function weekDays(param: string | null | undefined, today: string) {
  const date = parseDate(param) ?? Temporal.PlainDate.from(today);
  const monday = date.subtract({ days: date.dayOfWeek - 1 });
  return {
    days: Array.from({ length: 7 }, (_, i) => monday.add({ days: i }).toString()),
    prev: monday.subtract({ days: 7 }).toString(),
    next: monday.add({ days: 7 }).toString(),
  };
}

/** Side-by-side columns: overlapping pieces share a width, everything else keeps the full day column. */
function assignColumns(pieces: Placed[]) {
  const sorted = [...pieces].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const columnEnds: number[] = [];
    for (const piece of cluster) {
      const free = columnEnds.findIndex((end) => end <= piece.startMin);
      piece.column = free === -1 ? columnEnds.length : free;
      columnEnds[piece.column] = piece.endMin;
    }
    for (const piece of cluster) piece.columns = columnEnds.length;
    cluster = [];
  };
  for (const piece of sorted) {
    if (piece.startMin >= clusterEnd) close();
    cluster.push(piece);
    clusterEnd = Math.max(clusterEnd, piece.endMin);
  }
  close();
}

/** One piece per day for each item, clipped to that day and positioned by local minutes in `tz`. */
export function placeItems(items: { id: string; start: string; end: string }[], days: string[], tz: string): Placed[] {
  const placed: Placed[] = [];
  for (const date of days) {
    const dayStart = Temporal.PlainDate.from(date).toZonedDateTime(tz);
    const nextStart = dayStart.add({ days: 1 }).toInstant();
    const pieces: Placed[] = [];
    for (const item of items) {
      const start = Temporal.Instant.from(item.start);
      const end = Temporal.Instant.from(item.end);
      if (Temporal.Instant.compare(start, nextStart) >= 0 || Temporal.Instant.compare(end, dayStart.toInstant()) <= 0) continue;
      const startsToday = Temporal.Instant.compare(start, dayStart.toInstant()) >= 0;
      const endsToday = Temporal.Instant.compare(end, nextStart) < 0;
      const localStart = start.toZonedDateTimeISO(tz);
      const localEnd = end.toZonedDateTimeISO(tz);
      const startMin = startsToday ? localStart.hour * 60 + localStart.minute : 0;
      let endMin = endsToday ? localEnd.hour * 60 + localEnd.minute : DAY_MINUTES;
      // When the clocks go back the end can read earlier than the start: keep its real length.
      if (endMin <= startMin) endMin = Math.min(DAY_MINUTES, startMin + Math.max(1, Math.round(end.since(start).total("minutes"))));
      pieces.push({ id: item.id, date, startMin, endMin, startIso: item.start, endIso: item.end, column: 0, columns: 1 });
    }
    assignColumns(pieces);
    placed.push(...pieces);
  }
  return placed;
}

/** Availability rules projected from their own zone onto `days` in `tz`. A nonexistent local time is skipped. */
export function workingBands(
  rules: { weekday: number; start_time: string; end_time: string; timezone: string }[],
  days: string[],
  tz: string,
): { date: string; startMin: number; endMin: number }[] {
  const items: { id: string; start: string; end: string }[] = [];
  // The rule's local date can be a day either side of the viewer's.
  const first = Temporal.PlainDate.from(days[0]).subtract({ days: 1 });
  for (let i = 0; i < days.length + 2; i++) {
    const date = first.add({ days: i });
    for (const rule of rules) {
      if (rule.weekday !== date.dayOfWeek) continue;
      const start = zonedInstant(date, minutesOfDay(rule.start_time), rule.timezone);
      const endMinutes = minutesOfDay(rule.end_time);
      const end = endMinutes >= DAY_MINUTES ? zonedInstant(date.add({ days: 1 }), 0, rule.timezone) : zonedInstant(date, endMinutes, rule.timezone);
      if (start && end) items.push({ id: `${rule.weekday}${rule.start_time}`, start: start.toString(), end: end.toString() });
    }
  }
  return placeItems(items, days, tz).map(({ date, startMin, endMin }) => ({ date, startMin, endMin }));
}

/** Visible minutes of the day: 07:00 to 21:00, widened to whole hours for anything outside. */
export function hourRange(placed: { startMin: number; endMin: number }[]): { from: number; to: number } {
  let from = DEFAULT_FROM;
  let to = DEFAULT_TO;
  for (const p of placed) {
    from = Math.min(from, Math.floor(p.startMin / 60) * 60);
    to = Math.max(to, Math.ceil(p.endMin / 60) * 60);
  }
  return { from, to };
}

/**
 * The grid's hours. Appointments and working hours always fit; a block only widens the grid when none of it
 * would otherwise show, so a day off doesn't stretch every week to 24 hours.
 */
export function visibleRange(solid: { startMin: number; endMin: number }[], blocks: { startMin: number; endMin: number }[]) {
  const base = hourRange(solid);
  return hourRange([...solid, ...blocks.filter((b) => b.endMin <= base.from || b.startMin >= base.to)]);
}

/** The instants a week covers in `tz`, for querying. */
export function weekBounds(days: string[], tz: string): { from: string; to: string } {
  const start = (date: Temporal.PlainDate) => date.toZonedDateTime(tz).toInstant().toString();
  return { from: start(Temporal.PlainDate.from(days[0])), to: start(Temporal.PlainDate.from(days[days.length - 1]).add({ days: 1 })) };
}
