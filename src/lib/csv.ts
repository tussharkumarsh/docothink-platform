/** Quote a CSV cell, neutralising spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** A whole CSV document: header row then data rows, CRLF-separated. */
export function csvBody(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
