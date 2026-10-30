import { describe, expect, it } from "vitest";
import { INVOICE_STATUS, invoiceTotals, maskAccount, maskPan } from "./invoice";

describe("invoiceTotals (mirrors submit_invoice)", () => {
  it("withholds TDS half-up on the gross and pays the rest", () => {
    expect(invoiceTotals([{ amount: 90000 }, { amount: 72000 }], 1000, true)).toEqual({ gross: 162000, tds: 16200, net: 145800 });
    expect(invoiceTotals([{ amount: 105 }], 1000, true)).toEqual({ gross: 105, tds: 11, net: 94 });
  });

  it("includes refund reversals and skips TDS where it doesn't apply", () => {
    expect(invoiceTotals([{ amount: 4050 }, { amount: -900 }], 1000, false)).toEqual({ gross: 3150, tds: 0, net: 3150 });
  });
});

describe("masking for invoice documents", () => {
  it("shows only the last digits", () => {
    expect(maskAccount("123456789012")).toBe("••••9012");
    expect(maskPan("ABCDE1234F")).toBe("AB••••4F");
    expect(maskAccount(null)).toBe("—");
  });
});

describe("INVOICE_STATUS", () => {
  it("labels payout statuses the way invoices are discussed", () => {
    expect(INVOICE_STATUS.pending.label).toBe("Submitted");
    expect(INVOICE_STATUS.failed.label).toBe("Rejected");
    expect(INVOICE_STATUS.cancelled.label).toBe("Withdrawn");
  });
});
