import { describe, expect, it } from "vitest";
import { blockEnd, isBlockable, nextBlockStart } from "./block";

describe("blockEnd", () => {
  it("adds the length within the day", () => {
    expect(blockEnd("2026-11-03", 600, "60")).toEqual({ end_date: "2026-11-03", end_time: "11:00" });
    expect(blockEnd("2026-11-03", 600, "30")).toEqual({ end_date: "2026-11-03", end_time: "10:30" });
    expect(blockEnd("2026-11-03", 600, "120")).toEqual({ end_date: "2026-11-03", end_time: "12:00" });
  });

  it("rolls into the next day past midnight", () => {
    expect(blockEnd("2026-11-03", 1410, "60")).toEqual({ end_date: "2026-11-04", end_time: "00:30" });
    expect(blockEnd("2026-12-31", 1410, "60")).toEqual({ end_date: "2027-01-01", end_time: "00:30" });
  });

  it("ends the rest of the day at the following midnight", () => {
    expect(blockEnd("2026-11-03", 600, "rest")).toEqual({ end_date: "2026-11-04", end_time: "00:00" });
  });
});

describe("isBlockable", () => {
  it("refuses past days and past half hours, and allows the current half hour", () => {
    expect(isBlockable("2026-11-02", 600, "2026-11-03", 600)).toBe(false);
    expect(isBlockable("2026-11-03", 540, "2026-11-03", 600)).toBe(false);
    expect(isBlockable("2026-11-03", 600, "2026-11-03", 615)).toBe(true);
    expect(isBlockable("2026-11-04", 0, "2026-11-03", 600)).toBe(true);
  });
});

describe("nextBlockStart", () => {
  it("has no start on a day that has passed", () => {
    expect(nextBlockStart("2026-11-02", "2026-11-03", 600, 540)).toBeNull();
  });

  it("uses the next half hour today, and nothing once the day is over", () => {
    expect(nextBlockStart("2026-11-03", "2026-11-03", 605, 540)).toBe(630);
    expect(nextBlockStart("2026-11-03", "2026-11-03", 1425, 540)).toBeNull();
  });

  it("uses the start of working hours on a future day, or 09:00 without any", () => {
    expect(nextBlockStart("2026-11-04", "2026-11-03", 605, 600)).toBe(600);
    expect(nextBlockStart("2026-11-04", "2026-11-03", 605, undefined)).toBe(540);
  });
});
