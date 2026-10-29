import { describe, expect, it } from "vitest";
import { formatMoney, patientRefundPercent, splitCommission, toMinor } from "./money";
import { canTransition } from "./domain";

describe("commission", () => {
  it("₹1,000 at 10% → ₹100 commission, ₹900 to the doctor", () => {
    expect(splitCommission(100_000, 1000)).toEqual({ commission: 10_000, net: 90_000 });
  });

  it("parts always sum to the gross, with half-up rounding", () => {
    expect(splitCommission(4_505, 1000)).toEqual({ commission: 451, net: 4_054 }); // 450.5 → 451
    expect(splitCommission(4_504, 1000)).toEqual({ commission: 450, net: 4_054 });
    for (const gross of [1, 99, 3_333, 123_457]) {
      for (const bps of [0, 750, 1000, 1250, 10_000]) {
        const { commission, net } = splitCommission(gross, bps);
        expect(commission + net).toBe(gross);
      }
    }
  });

  it("rejects invalid input", () => {
    expect(() => splitCommission(-1, 1000)).toThrow();
    expect(() => splitCommission(10.5, 1000)).toThrow();
    expect(() => splitCommission(100, 10_001)).toThrow();
  });
});

describe("money parsing and formatting", () => {
  it("parses major amounts without float drift", () => {
    expect(toMinor("1,000.50", "INR")).toBe(100_050);
    expect(toMinor("0.1", "USD")).toBe(10);
    expect(toMinor("19.999", "GBP")).toBeNull();
    expect(toMinor("abc", "USD")).toBeNull();
  });

  it("formats in the right currency", () => {
    expect(formatMoney(100_000, "INR")).toBe("₹1,000.00");
    expect(formatMoney(4_500, "GBP")).toBe("£45.00");
    expect(formatMoney(9_000, "USD")).toBe("$90.00");
  });
});

describe("cancellation policy", () => {
  const policy = { full_refund_hours_before: 24, partial_refund_hours_before: 4, partial_refund_percent: 50 };
  it("applies full / partial / none", () => {
    expect(patientRefundPercent(30, policy)).toBe(100);
    expect(patientRefundPercent(10, policy)).toBe(50);
    expect(patientRefundPercent(1, policy)).toBe(0);
  });
});

describe("appointment state machine", () => {
  it("allows only defined transitions", () => {
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("completed", "confirmed")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("pending_payment", "completed")).toBe(false);
    expect(canTransition("refunded", "cancelled")).toBe(false);
  });
});
