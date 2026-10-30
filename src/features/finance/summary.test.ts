import { describe, expect, it } from "vitest";
import { monthly, summarise, type LedgerRow } from "./summary";

const row = (r: Partial<LedgerRow>): LedgerRow => ({
  id: 1, doctor_id: "d", entry_type: "consultation_earning", currency: "INR", amount: 0, gross_amount: null, commission_amount: null, created_at: "2026-10-01T10:00:00Z", in_payout: false, ...r,
});

describe("earnings summary", () => {
  const ledger = [
    row({ id: 1, amount: 90_000, gross_amount: 100_000, commission_amount: 10_000, in_payout: true }),
    row({ id: 2, entry_type: "refund_reversal", amount: -18_000, gross_amount: -20_000, commission_amount: -2_000, in_payout: true }),
    row({ id: 3, amount: 45_000, gross_amount: 50_000, commission_amount: 5_000, created_at: "2026-11-02T10:00:00Z" }),
    row({ id: 4, entry_type: "payout", amount: -72_000 }),
    row({ id: 5, currency: "GBP", amount: 3_150, gross_amount: 3_500, commission_amount: 350 }),
  ];
  const payouts = [{ status: "paid", amount: 72_000, currency: "INR" }, { status: "approved", amount: 1_000, currency: "GBP" }];

  it("computes gross, commission, net, pending settlement and paid per currency", () => {
    const [inr, gbp] = summarise(ledger, payouts);
    expect(inr).toEqual({ currency: "INR", consultations: 2, gross: 130_000, commission: 13_000, net: 117_000, pendingSettlement: 45_000, approved: 0, paid: 72_000, inReview: 0, tdsWithheld: 0 });
    expect(gbp.net).toBe(3_150);
    expect(gbp.approved).toBe(1_000);
  });

  it("totals TDS withheld on paid invoices only", () => {
    const [inr] = summarise(ledger, [
      { status: "paid", amount: 64_800, currency: "INR", tds_amount: 7_200 },
      { status: "failed", amount: 81_000, currency: "INR", tds_amount: 9_000 },
    ]);
    expect(inr.tdsWithheld).toBe(7_200);
    expect(inr.paid).toBe(64_800);
  });

  it("groups by month in the doctor's time zone", () => {
    const rows = monthly([row({ amount: 100, created_at: "2026-10-31T20:00:00Z" })], "Asia/Kolkata");
    expect(rows[0].month).toBe("2026-11"); // 01:30 on 1 Nov in India
  });
});
