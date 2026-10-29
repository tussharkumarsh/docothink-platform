import { Temporal } from "temporal-polyfill";
import type { DoctorCard } from "./queries";

/** Pure helpers for doctor discovery (home page prices, Find a doctor filters and sorting). */

export type ListedDoctor = {
  doctor: Pick<DoctorCard, "slug" | "currency" | "fee_chat" | "fee_audio" | "fee_video" | "years_experience"> & {
    specialties: { slug: string }[];
  };
  /** Next bookable slot start (ISO), or null when none is open within the doctor's horizon. */
  next: string | null;
};

export type FromPrice = { currency: string; amount: number };

function lowestFee(d: ListedDoctor["doctor"]): number | null {
  const fees = [d.fee_chat, d.fee_audio, d.fee_video].filter((f): f is number => f != null);
  return fees.length ? Math.min(...fees) : null;
}

/**
 * Cheapest consultation per specialty, one entry per currency (fees can't be compared across
 * currencies without exchange rates). Specialties with no priced doctor are absent.
 */
export function lowestFeesBySpecialty(doctors: ListedDoctor["doctor"][]): Map<string, FromPrice[]> {
  const best = new Map<string, Map<string, number>>();
  for (const d of doctors) {
    const fee = lowestFee(d);
    if (fee == null) continue;
    for (const { slug } of d.specialties) {
      const byCurrency = best.get(slug) ?? new Map<string, number>();
      byCurrency.set(d.currency, Math.min(fee, byCurrency.get(d.currency) ?? Infinity));
      best.set(slug, byCurrency);
    }
  }
  return new Map(
    [...best].map(([slug, byCurrency]) => [
      slug,
      [...byCurrency].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
    ]),
  );
}

function localDate(epochMs: number, timezone: string): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timezone).toPlainDate();
}

/** Days from the patient's today to the slot's date, both in the patient's zone (0 = today). */
function daysAhead(slotIso: string, timezone: string, nowMs: number): number {
  return localDate(nowMs, timezone).until(localDate(Date.parse(slotIso), timezone), { largestUnit: "days" }).days;
}

export function nextAvailableDay(slotIso: string, timezone: string, nowMs: number): "today" | "tomorrow" | null {
  const days = daysAhead(slotIso, timezone, nowMs);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : null;
}

export const AVAILABILITY_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Today or tomorrow" },
  { value: "3", label: "Next 3 days" },
  { value: "7", label: "Next 7 days" },
] as const;

/** "" means any time. Day windows count calendar days in the patient's zone, today included. */
export function availabilityMatches(slotIso: string | null, filter: string, timezone: string, nowMs: number): boolean {
  if (!filter) return true;
  if (!slotIso) return false;
  const windowDays = filter === "today" ? 1 : filter === "tomorrow" ? 2 : Number(filter);
  if (!Number.isInteger(windowDays) || windowDays < 1) return true;
  return daysAhead(slotIso, timezone, nowMs) < windowDays;
}

export const SORT_OPTIONS = [
  { value: "available", label: "Earliest available" },
  { value: "experience", label: "Most experienced" },
  { value: "fee_asc", label: "Fee: low to high" },
  { value: "fee_desc", label: "Fee: high to low" },
] as const;

export type DoctorSort = (typeof SORT_OPTIONS)[number]["value"];

export function parseSort(value: string | undefined): DoctorSort {
  return SORT_OPTIONS.some((o) => o.value === value) ? (value as DoctorSort) : "available";
}

/** Missing values (no slot, unknown experience, no fee) always sort last. Fees compare within a currency only. */
export function sortDoctors<T extends ListedDoctor>(items: T[], sort: DoctorSort): T[] {
  const last = (a: number | null, b: number | null, cmp: (x: number, y: number) => number) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : cmp(a, b);
  return [...items].sort((a, b) => {
    switch (sort) {
      case "experience":
        return last(a.doctor.years_experience, b.doctor.years_experience, (x, y) => y - x);
      case "fee_asc":
      case "fee_desc": {
        const byCurrency = a.doctor.currency.localeCompare(b.doctor.currency);
        if (byCurrency !== 0) return byCurrency;
        return last(lowestFee(a.doctor), lowestFee(b.doctor), (x, y) => (sort === "fee_asc" ? x - y : y - x));
      }
      default:
        return last(a.next ? Date.parse(a.next) : null, b.next ? Date.parse(b.next) : null, (x, y) => x - y);
    }
  });
}
