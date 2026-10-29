import { Temporal } from "temporal-polyfill";
import type { ConsultationMode } from "@/lib/domain";

/**
 * Slot generation. Mirrors `assert_slot_bookable()` in the database, which remains the
 * source of truth at booking time:
 *  - a rule is a wall-clock window in its own IANA zone on an ISO weekday (1 = Monday);
 *  - slots start at rule.start + k × (slot + buffer) and must end by rule.end (local minutes);
 *  - local times that do not exist (spring-forward gap) are skipped; ambiguous ones
 *    (fall-back overlap) use the earlier instant;
 *  - horizon N days = doctor-local today … today + N − 1; starts before now + notice are dropped.
 * No fixed UTC offsets are used anywhere: every conversion goes through tz rules for that date.
 */

export type AvailabilityRule = {
  weekday: number;
  /** "HH:MM" or "HH:MM:SS"; end may be "24:00". */
  startTime: string;
  endTime: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  modes: ConsultationMode[];
};

export type BusyInterval = { start: string; end: string };

export type Slot = {
  /** ISO-8601 UTC instants. */
  start: string;
  end: string;
  modes: ConsultationMode[];
};

export type GenerateSlotsInput = {
  rules: AvailabilityRule[];
  busy: BusyInterval[];
  doctorTimezone: string;
  horizonDays: number;
  minNoticeMinutes: number;
  now: Temporal.Instant;
  mode?: ConsultationMode;
};

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function localDateTime(date: Temporal.PlainDate, minutes: number): Temporal.PlainDateTime {
  return date.toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
}

/** Instant for a local wall-clock time, or null when that time does not exist (DST gap). */
export function zonedInstant(
  date: Temporal.PlainDate,
  minutes: number,
  timezone: string,
): Temporal.Instant | null {
  const local = localDateTime(date, minutes);
  try {
    return local.toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant();
  } catch {
    // RangeError: either nonexistent (gap) or ambiguous (overlap). Ambiguous → earlier instant.
    // In a gap, "earlier" resolves to a different wall-clock time, which we reject.
    const earlier = local.toZonedDateTime(timezone, { disambiguation: "earlier" });
    const back = earlier.toPlainDateTime();
    if (back.hour * 60 + back.minute !== minutes || !back.toPlainDate().equals(date)) return null;
    return earlier.toInstant();
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { rules, busy, doctorTimezone, horizonDays, minNoticeMinutes, now, mode } = input;
  const earliest = now.add({ minutes: minNoticeMinutes }).epochMilliseconds;
  const doctorToday = now.toZonedDateTimeISO(doctorTimezone).toPlainDate();
  const lastDoctorDate = doctorToday.add({ days: horizonDays - 1 });
  const busyMs = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);

  const byStart = new Map<number, Slot>();

  for (const rule of rules) {
    if (mode && !rule.modes.includes(mode)) continue;
    const ruleStart = minutesOfDay(rule.startTime);
    const ruleEnd = minutesOfDay(rule.endTime);
    const step = rule.slotMinutes + rule.bufferMinutes;
    // Rule zones can differ from the doctor's; scan one extra day each side and filter by doctor date.
    const ruleToday = now.toZonedDateTimeISO(rule.timezone).toPlainDate();

    for (let offset = -1; offset <= horizonDays; offset++) {
      const date = ruleToday.add({ days: offset });
      if (date.dayOfWeek !== rule.weekday) continue;

      for (let m = ruleStart; m + rule.slotMinutes <= ruleEnd; m += step) {
        const instant = zonedInstant(date, m, rule.timezone);
        if (!instant) continue;
        const startMs = instant.epochMilliseconds;
        if (startMs < earliest) continue;
        const doctorDate = instant.toZonedDateTimeISO(doctorTimezone).toPlainDate();
        if (Temporal.PlainDate.compare(doctorDate, lastDoctorDate) > 0) continue;
        const endMs = startMs + rule.slotMinutes * 60_000;
        if (busyMs.some(([bs, be]) => overlaps(startMs, endMs, bs, be))) continue;

        const existing = byStart.get(startMs);
        if (existing) {
          existing.modes = Array.from(new Set([...existing.modes, ...rule.modes]));
        } else {
          byStart.set(startMs, {
            start: instant.toString(),
            end: Temporal.Instant.fromEpochMilliseconds(endMs).toString(),
            modes: [...rule.modes],
          });
        }
      }
    }
  }

  return Array.from(byStart.values()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Groups slots by calendar date in the viewer's zone (a slot can land on a different date than the doctor's). */
export function groupSlotsByLocalDate(slots: Slot[], timezone: string): { date: string; slots: Slot[] }[] {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const date = Temporal.Instant.from(slot.start).toZonedDateTimeISO(timezone).toPlainDate().toString();
    const list = groups.get(date) ?? [];
    list.push(slot);
    groups.set(date, list);
  }
  return Array.from(groups, ([date, list]) => ({ date, slots: list }));
}
