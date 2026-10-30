import { describe, expect, it } from "vitest";
import { KYC_PATTERNS, parseLines, profileCompleteness } from "./kyc";

describe("KYC_PATTERNS (mirror the database checks)", () => {
  it("accepts valid and rejects invalid values", () => {
    expect(KYC_PATTERNS.ifsc.test("SBIN0001234")).toBe(true);
    expect(KYC_PATTERNS.ifsc.test("SBIN1234")).toBe(false);
    expect(KYC_PATTERNS.pan.test("ABCDE1234F")).toBe(true);
    expect(KYC_PATTERNS.pan.test("ABCD1234F")).toBe(false);
    expect(KYC_PATTERNS.gstin.test("27ABCDE1234F1Z5")).toBe(true);
    expect(KYC_PATTERNS.sortCode.test("123456")).toBe(true);
    expect(KYC_PATTERNS.sortCode.test("12345")).toBe(false);
    expect(KYC_PATTERNS.routing.test("021000021")).toBe(true);
    expect(KYC_PATTERNS.taxId.test("12345678")).toBe(false);
    expect(KYC_PATTERNS.account.IN.test("123456789012")).toBe(true);
    expect(KYC_PATTERNS.account.GB.test("1234567")).toBe(false);
    expect(KYC_PATTERNS.account.US.test("1234")).toBe(true);
  });
});

describe("profileCompleteness", () => {
  const all = { education: 2, experience: 1, services: 4, specialInterests: 0, addressComplete: true, kycStatus: "verified" };

  it("counts five items and ignores optional special interests", () => {
    expect(profileCompleteness(all)).toEqual({ done: 5, total: 5, missing: [] });
  });

  it("treats bank details as done only once verified", () => {
    const r = profileCompleteness({ ...all, kycStatus: "pending" });
    expect(r.done).toBe(4);
    expect(r.missing).toEqual([{ key: "bank", label: "Bank & tax verified", tab: "bank" }]);
  });
});

describe("parseLines", () => {
  it("trims, drops blanks and case-insensitive duplicates", () => {
    expect(parseLines("a\n\n A \nb", 10, 80)).toEqual({ items: ["a", "b"] });
  });

  it("reports too many or too long items instead of silently cutting them", () => {
    expect(parseLines("a\nb\nc", 2, 80).error).toBe("Keep it to 2 items or fewer.");
    expect(parseLines("x".repeat(81), 10, 80).error).toBe("Each item must be 80 characters or fewer.");
  });
});
