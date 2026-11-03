import { describe, expect, it } from "vitest";
import { hourRange, placeItems, visibleRange, weekBounds, weekDays, workingBands } from "./week";

const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

describe("weekDays", () => {
  it("returns Monday to Sunday for any date in the week", () => {
    const w = weekDays("2026-11-04", "2026-01-15");
    expect(w.days).toEqual(WEEK);
    expect(w.prev).toBe("2026-10-26");
    expect(w.next).toBe("2026-11-09");
  });

  it("falls back to today for missing or invalid input", () => {
    expect(weekDays("garbage", "2026-11-04").days).toEqual(WEEK);
    expect(weekDays(null, "2026-11-04").days).toEqual(WEEK);
    expect(weekDays("2026-13-45", "2026-11-04").days).toEqual(WEEK);
  });

  it("crosses year boundaries", () => {
    expect(weekDays("2026-01-01", "2026-11-04").days[0]).toBe("2025-12-29");
  });
});

describe("placeItems", () => {
  it("places an item by local minutes in the viewer's zone", () => {
    const [p] = placeItems([{ id: "a", start: "2026-11-03T03:30:00Z", end: "2026-11-03T04:00:00Z" }], WEEK, "Asia/Kolkata");
    expect(p).toMatchObject({ id: "a", date: "2026-11-03", startMin: 540, endMin: 570, column: 0, columns: 1 });
  });

  it("splits an item crossing midnight into one piece per day, keeping the full range", () => {
    const placed = placeItems([{ id: "a", start: "2026-11-03T23:30:00Z", end: "2026-11-04T00:30:00Z" }], WEEK, "UTC");
    expect(placed.map((p) => [p.date, p.startMin, p.endMin])).toEqual([
      ["2026-11-03", 1410, 1440],
      ["2026-11-04", 0, 30],
    ]);
    expect(placed[1].startIso).toBe("2026-11-03T23:30:00Z");
    expect(placed[0].endIso).toBe("2026-11-04T00:30:00Z");
  });

  it("drops items outside the days and clips a block that runs past the week", () => {
    expect(placeItems([{ id: "a", start: "2026-11-20T10:00:00Z", end: "2026-11-20T11:00:00Z" }], WEEK, "UTC")).toEqual([]);
    const placed = placeItems([{ id: "b", start: "2026-11-08T12:00:00Z", end: "2026-11-12T12:00:00Z" }], WEEK, "UTC");
    expect(placed.map((p) => [p.date, p.startMin, p.endMin])).toEqual([["2026-11-08", 720, 1440]]);
  });

  it("puts overlapping items side by side and leaves the others full width", () => {
    const placed = placeItems(
      [
        { id: "appt", start: "2026-11-03T10:00:00Z", end: "2026-11-03T10:30:00Z" },
        { id: "block", start: "2026-11-03T10:00:00Z", end: "2026-11-03T12:00:00Z" },
        { id: "later", start: "2026-11-03T15:00:00Z", end: "2026-11-03T15:30:00Z" },
      ],
      WEEK,
      "UTC",
    );
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.appt.columns).toBe(2);
    expect(by.block.columns).toBe(2);
    expect(by.appt.column).not.toBe(by.block.column);
    expect(by.later).toMatchObject({ column: 0, columns: 1 });
  });

  it("stays correct across the spring daylight-saving change", () => {
    const days = ["2026-03-08"];
    // 01:30 EST to 03:30 EDT: an hour of real time, across the skipped hour.
    const [p] = placeItems([{ id: "a", start: "2026-03-08T06:30:00Z", end: "2026-03-08T07:30:00Z" }], days, "America/New_York");
    expect(p).toMatchObject({ startMin: 90, endMin: 210 });
  });

  it("keeps a positive height when the autumn clock change makes the end read earlier", () => {
    const days = ["2026-11-01"];
    // 01:30 EDT to 01:10 EST: forty minutes of real time.
    const [p] = placeItems([{ id: "a", start: "2026-11-01T05:30:00Z", end: "2026-11-01T06:10:00Z" }], days, "America/New_York");
    expect(p.startMin).toBe(90);
    expect(p.endMin).toBe(130);
  });
});

describe("workingBands", () => {
  const rule = (weekday: number, start_time: string, end_time: string, timezone: string) => ({ weekday, start_time, end_time, timezone });

  it("projects a rule from its own zone into the viewer's", () => {
    expect(workingBands([rule(1, "09:00:00", "17:00:00", "Asia/Kolkata")], WEEK, "UTC")).toEqual([{ date: "2026-11-02", startMin: 210, endMin: 690 }]);
  });

  it("moves to another date when the zones put it there", () => {
    expect(workingBands([rule(1, "20:00", "22:00", "America/New_York")], WEEK, "Asia/Kolkata")).toEqual([{ date: "2026-11-03", startMin: 390, endMin: 510 }]);
  });

  it("handles working hours that end at midnight", () => {
    expect(workingBands([rule(1, "22:00", "24:00", "UTC")], WEEK, "UTC")).toEqual([{ date: "2026-11-02", startMin: 1320, endMin: 1440 }]);
  });

  it("skips a working hour that doesn't exist on a daylight-saving day", () => {
    expect(workingBands([rule(7, "02:30", "02:45", "America/New_York")], ["2026-03-08"], "America/New_York")).toEqual([]);
  });
});

describe("hourRange", () => {
  it("defaults to 07:00 to 21:00", () => {
    expect(hourRange([])).toEqual({ from: 420, to: 1260 });
  });

  it("widens to whole hours for anything outside", () => {
    expect(hourRange([{ startMin: 375, endMin: 390 }])).toEqual({ from: 360, to: 1260 });
    expect(hourRange([{ startMin: 1275, endMin: 1300 }])).toEqual({ from: 420, to: 1320 });
  });
});

describe("visibleRange", () => {
  it("doesn't let a full-day block stretch the grid to 24 hours", () => {
    expect(visibleRange([], [{ startMin: 0, endMin: 1440 }])).toEqual({ from: 420, to: 1260 });
  });

  it("widens for appointments and for a block otherwise out of sight", () => {
    expect(visibleRange([{ startMin: 360, endMin: 390 }], [])).toEqual({ from: 360, to: 1260 });
    expect(visibleRange([], [{ startMin: 1320, endMin: 1380 }])).toEqual({ from: 420, to: 1380 });
  });
});

describe("weekBounds", () => {
  it("runs from local midnight on Monday to local midnight after Sunday", () => {
    expect(weekBounds(WEEK, "Asia/Kolkata")).toEqual({ from: "2026-11-01T18:30:00Z", to: "2026-11-08T18:30:00Z" });
  });
});
