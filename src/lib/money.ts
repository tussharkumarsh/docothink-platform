/**
 * Money is integer minor units (paise, cents, pence) plus an ISO-4217 code.
 * Commission maths matches public.split_commission(): half-up rounding, net = gross − commission.
 */

export type Currency = "INR" | "USD" | "GBP";
export const CURRENCIES: Currency[] = ["INR", "USD", "GBP"];

const MINOR_UNITS: Record<Currency, number> = { INR: 2, USD: 2, GBP: 2 };

export function splitCommission(grossMinor: number, rateBps: number): { commission: number; net: number } {
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0) throw new RangeError("gross must be a non-negative integer");
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new RangeError("rate must be 0–10000 bps");
  const commission = Math.floor((grossMinor * rateBps + 5_000) / 10_000);
  return { commission, net: grossMinor - commission };
}

export function formatMoney(minor: number, currency: string): string {
  const units = MINOR_UNITS[currency as Currency] ?? 2;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : currency === "GBP" ? "en-GB" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: units,
    maximumFractionDigits: units,
  }).format(minor / 10 ** units);
}

/** Parses a user-entered major amount ("1,000.50") into minor units without float drift. */
export function toMinor(major: string, currency: string): number | null {
  const units = MINOR_UNITS[currency as Currency] ?? 2;
  const cleaned = major.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > units) return null;
  const value = Number(whole) * 10 ** units + Number(frac.padEnd(units, "0") || "0");
  return Number.isSafeInteger(value) ? value : null;
}

export function toMajorString(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "";
  const units = MINOR_UNITS[currency as Currency] ?? 2;
  return (minor / 10 ** units).toFixed(units);
}

/** Refund percentage from the cancellation policy, mirroring cancel_appointment() for patients. */
export function patientRefundPercent(
  hoursBeforeStart: number,
  policy: { full_refund_hours_before: number; partial_refund_hours_before: number; partial_refund_percent: number },
): number {
  if (hoursBeforeStart >= policy.full_refund_hours_before) return 100;
  if (hoursBeforeStart >= policy.partial_refund_hours_before) return policy.partial_refund_percent;
  return 0;
}
