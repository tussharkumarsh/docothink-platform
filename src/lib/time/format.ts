/** Display helpers. Intl applies the zone's real rules (including DST) for each instant. */

export function formatDateTime(iso: string, timezone: string, opts?: { withZone?: boolean }): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return opts?.withZone === false ? text : `${text} (${timezone})`;
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatDate(isoOrDate: string, timezone = "UTC"): string {
  // Plain dates ("2026-11-02") are calendar dates; format them without zone shifting.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? "UTC" : timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Short zone name for this instant, e.g. "EST"/"EDT", "GMT+5:30". */
export function zoneAbbreviation(iso: string, timezone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timezone;
}

/** "8:30 AM — America/New_York" style label used in booking UIs and emails. */
export function slotLabel(iso: string, timezone: string): string {
  return `${formatTime(iso, timezone)} — ${timezone}`;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.includes("/") || tz === "UTC";
  } catch {
    return false;
  }
}

export function supportedTimezones(): string[] {
  const values = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
  return values && values.length > 0
    ? values
    : ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Kolkata"];
}
