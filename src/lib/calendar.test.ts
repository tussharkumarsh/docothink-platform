import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "./calendar";

const event = {
  uid: "abc@docothink",
  start: "2026-11-05T12:30:00Z",
  end: "2026-11-05T12:50:00Z",
  summary: "Docothink consultation · Video call",
  description: "Join: https://docothink.example/consult/abc\nReference: DT-1",
  url: "https://docothink.example/consult/abc",
  now: "2026-10-31T08:00:00Z",
};

describe("buildIcs", () => {
  const ics = buildIcs(event);

  it("writes a valid VEVENT with UTC times and CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Docothink//EN\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261105T123000Z\r\n");
    expect(ics).toContain("DTEND:20261105T125000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261031T080000Z\r\n");
    expect(ics).toContain("UID:abc@docothink\r\n");
    expect(ics).toContain("SUMMARY:Docothink consultation · Video call\r\n");
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
  });

  it("escapes special characters and newlines", () => {
    expect(buildIcs({ ...event, description: "a;b,c\\d\ne" })).toContain("DESCRIPTION:a\\;b\\,c\\\\d\\ne\r\n");
  });

  it("folds lines longer than 75 octets", () => {
    const folded = buildIcs({ ...event, description: "x".repeat(200) });
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded).toContain("\r\n x");
  });
});

describe("googleCalendarUrl", () => {
  it("prefills the event times and title", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261105T123000Z/20261105T125000Z");
    expect(url.searchParams.get("text")).toBe("Docothink consultation · Video call");
  });
});
