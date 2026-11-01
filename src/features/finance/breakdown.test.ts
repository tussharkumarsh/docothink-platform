import { describe, expect, it } from "vitest";
import { byMode, lastMonths } from "./breakdown";
import { niceMax } from "@/components/charts/bar-chart";

const row = (r: { entry_type: string; amount: number; currency?: string; mode?: string | null }) => ({
  currency: "INR",
  mode: "video",
  ...r,
});

describe("byMode", () => {
  it("nets earnings and refund reversals per consultation type, largest first", () => {
    const rows = [
      row({ entry_type: "consultation_earning", amount: 90_000, mode: "video" }),
      row({ entry_type: "refund_reversal", amount: -18_000, mode: "video" }),
      row({ entry_type: "consultation_earning", amount: 45_000, mode: "chat" }),
      row({ entry_type: "consultation_earning", amount: 120_000, mode: "audio" }),
    ];
    expect(byMode(rows, "INR")).toEqual([
      { mode: "audio", net: 120_000 },
      { mode: "video", net: 72_000 },
      { mode: "chat", net: 45_000 },
    ]);
  });

  it("ignores payouts, other currencies and rows without a consultation", () => {
    const rows = [
      row({ entry_type: "payout", amount: -50_000 }),
      row({ entry_type: "consultation_earning", amount: 3_000, currency: "GBP" }),
      row({ entry_type: "adjustment", amount: 1_000, mode: null }),
      row({ entry_type: "consultation_earning", amount: 10_000, mode: "chat" }),
    ];
    expect(byMode(rows, "INR")).toEqual([{ mode: "chat", net: 10_000 }]);
  });
});


describe("niceMax", () => {
  it("rounds the axis maximum up to a clean value", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(87)).toBe(100);
    expect(niceMax(162000)).toBe(200000);
    expect(niceMax(240)).toBe(250);
    expect(niceMax(1000)).toBe(1000);
  });
});

describe("lastMonths", () => {
  it("returns the last N calendar months oldest first, zero where there was nothing", () => {
    const rows = [
      { month: "2026-10", currency: "INR", net: 5_000 },
      { month: "2026-08", currency: "INR", net: 2_000 },
      { month: "2026-10", currency: "GBP", net: 9_000 },
      { month: "2025-01", currency: "INR", net: 7_000 },
    ];
    expect(lastMonths(rows, "INR", "2026-11", 4)).toEqual([
      { month: "2026-08", net: 2_000 },
      { month: "2026-09", net: 0 },
      { month: "2026-10", net: 5_000 },
      { month: "2026-11", net: 0 },
    ]);
  });

  it("crosses year boundaries", () => {
    expect(lastMonths([], "INR", "2026-02", 3).map((m) => m.month)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});
