import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { generateSlots, groupSlotsByLocalDate, zonedInstant, type AvailabilityRule } from "./slots";
import { formatTime, slotLabel, zoneAbbreviation } from "./format";

const at = (iso: string) => Temporal.Instant.from(iso);

const rule = (overrides: Partial<AvailabilityRule>): AvailabilityRule => ({
  weekday: 1,
  startTime: "19:00",
  endTime: "20:00",
  timezone: "Asia/Kolkata",
  slotMinutes: 30,
  bufferMinutes: 0,
  modes: ["video"],
  ...overrides,
});

describe("India doctor → US/UK patients across 2026 DST changes", () => {
  // Doctor: 19:00 IST every weekday. IST has no DST; the US/UK offsets change underneath it.
  const rules = [1, 2, 3, 4, 5].map((weekday) => rule({ weekday, endTime: "19:30" }));
  const slots = generateSlots({
    rules,
    busy: [],
    doctorTimezone: "Asia/Kolkata",
    horizonDays: 15, // 19 Oct … 2 Nov (doctor-local)
    minNoticeMinutes: 0,
    now: at("2026-10-19T00:00:00Z"),
  });
  const byDate = (d: string) => slots.find((s) => s.start.startsWith(d))!;

  it("is always 13:30 UTC (no fixed India-to-US offset is assumed)", () => {
    expect(slots.length).toBe(11);
    for (const s of slots) expect(s.start.slice(11, 16)).toBe("13:30");
  });

  it("London sees 14:30 BST before 25 Oct and 13:30 GMT after", () => {
    expect(formatTime(byDate("2026-10-23").start, "Europe/London")).toBe("2:30 PM");
    expect(zoneAbbreviation(byDate("2026-10-23").start, "Europe/London")).toMatch(/BST|GMT\+1/);
    expect(formatTime(byDate("2026-10-26").start, "Europe/London")).toBe("1:30 PM");
  });

  it("New York sees 9:30 EDT before 1 Nov and 8:30 EST after", () => {
    expect(formatTime(byDate("2026-10-30").start, "America/New_York")).toBe("9:30 AM");
    expect(formatTime(byDate("2026-11-02").start, "America/New_York")).toBe("8:30 AM");
    expect(zoneAbbreviation(byDate("2026-11-02").start, "America/New_York")).toBe("EST");
  });

  it("labels slots with the patient zone", () => {
    expect(slotLabel(byDate("2026-11-02").start, "America/New_York")).toBe("8:30 AM — America/New_York");
  });
});

describe("cross-midnight dates", () => {
  it("a Tuesday 06:00 IST slot is Monday evening in New York", () => {
    const slots = generateSlots({
      rules: [rule({ weekday: 2, startTime: "06:00", endTime: "06:30" })],
      busy: [],
      doctorTimezone: "Asia/Kolkata",
      horizonDays: 7,
      minNoticeMinutes: 0,
      now: at("2026-09-06T00:00:00Z"),
    });
    expect(slots[0].start).toBe("2026-09-08T00:30:00Z");
    const groups = groupSlotsByLocalDate(slots, "America/New_York");
    expect(groups[0].date).toBe("2026-09-07");
    expect(formatTime(slots[0].start, "America/New_York")).toBe("8:30 PM");
  });
});

describe("doctor in a DST zone", () => {
  it("skips wall-clock times that do not exist on spring-forward day (London, 29 Mar 2026)", () => {
    const slots = generateSlots({
      rules: [rule({ weekday: 7, startTime: "00:30", endTime: "03:00", timezone: "Europe/London" })],
      busy: [],
      doctorTimezone: "Europe/London",
      horizonDays: 2,
      minNoticeMinutes: 0,
      now: at("2026-03-28T12:00:00Z"),
    });
    // 00:30 GMT, then 01:00 and 01:30 don't exist, then 02:00 and 02:30 BST.
    expect(slots.map((s) => s.start)).toEqual([
      "2026-03-29T00:30:00Z",
      "2026-03-29T01:00:00Z",
      "2026-03-29T01:30:00Z",
    ]);
  });

  it("uses the earlier instant for ambiguous fall-back times (London, 25 Oct 2026)", () => {
    expect(zonedInstant(Temporal.PlainDate.from("2026-10-25"), 60, "Europe/London")?.toString()).toBe(
      "2026-10-25T00:00:00Z",
    );
    expect(zonedInstant(Temporal.PlainDate.from("2026-03-29"), 60, "Europe/London")).toBeNull();
  });

  it("keeps US doctor wall-clock hours steady across US DST end", () => {
    const rules = [1, 5].map((weekday) => rule({ weekday, startTime: "08:00", endTime: "08:30", timezone: "America/New_York" }));
    const slots = generateSlots({
      rules,
      busy: [],
      doctorTimezone: "America/New_York",
      horizonDays: 7,
      minNoticeMinutes: 0,
      now: at("2026-10-29T12:00:00Z"),
    });
    expect(slots.map((s) => s.start)).toEqual(["2026-10-30T12:00:00Z", "2026-11-02T13:00:00Z"]);
    // A London patient: 12:00 GMT on 30 Oct (UK already on GMT), 13:00 GMT on 2 Nov.
    expect(formatTime(slots[0].start, "Europe/London")).toBe("12:00 PM");
    expect(formatTime(slots[1].start, "Europe/London")).toBe("1:00 PM");
  });
});

describe("grid, buffers, notice, horizon and busy time", () => {
  const base = {
    doctorTimezone: "Europe/London",
    horizonDays: 1,
    minNoticeMinutes: 0,
    now: at("2026-11-02T00:00:00Z"), // Monday, GMT
  };

  it("steps by slot + buffer and fits slots inside the window", () => {
    const slots = generateSlots({
      ...base,
      rules: [rule({ timezone: "Europe/London", startTime: "09:00", endTime: "10:00", slotMinutes: 15, bufferMinutes: 5 })],
      busy: [],
    });
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(["09:00", "09:20", "09:40"]);
    expect(slots[0].end).toBe("2026-11-02T09:15:00Z");
  });

  it("supports a window ending at 24:00", () => {
    const slots = generateSlots({
      ...base,
      rules: [rule({ timezone: "Europe/London", startTime: "22:00", endTime: "24:00", slotMinutes: 60 })],
      busy: [],
    });
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(["22:00", "23:00"]);
  });

  it("removes busy and too-soon slots and respects the horizon", () => {
    const slots = generateSlots({
      ...base,
      now: at("2026-11-02T09:10:00Z"),
      minNoticeMinutes: 30,
      rules: [rule({ weekday: 1, timezone: "Europe/London", startTime: "09:00", endTime: "11:00", slotMinutes: 30 }),
        rule({ weekday: 2, timezone: "Europe/London", startTime: "09:00", endTime: "10:00", slotMinutes: 30 })],
      busy: [{ start: "2026-11-02T10:00:00Z", end: "2026-11-02T10:30:00Z" }],
    });
    // 09:00 and 09:30 start before now + 30 min (09:40); 10:00 is busy; Tuesday is past the 1-day horizon.
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(["10:30"]);
  });

  it("filters by mode and merges modes from parallel rules", () => {
    const rules = [rule({ timezone: "Europe/London", startTime: "09:00", endTime: "09:30", modes: ["chat"] })];
    expect(generateSlots({ ...base, rules, busy: [], mode: "video" })).toHaveLength(0);
    expect(generateSlots({ ...base, rules, busy: [], mode: "chat" })[0].modes).toEqual(["chat"]);
  });
});
