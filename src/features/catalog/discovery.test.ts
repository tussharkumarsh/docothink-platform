import { describe, expect, it } from "vitest";
import { availabilityMatches, lowestFeesBySpecialty, nextAvailableDay, sortDoctors, type ListedDoctor } from "./discovery";
import { formatPrice } from "@/lib/money";

const doctor = (overrides: Partial<ListedDoctor["doctor"]> & { slug: string }): ListedDoctor["doctor"] => ({
  currency: "INR",
  fee_chat: null,
  fee_audio: null,
  fee_video: null,
  years_experience: null,
  specialties: [],
  ...overrides,
});

describe("lowestFeesBySpecialty", () => {
  it("takes the cheapest offered mode per doctor and the cheapest doctor per specialty and currency", () => {
    const fees = lowestFeesBySpecialty([
      doctor({ slug: "a", currency: "INR", fee_chat: 50000, fee_video: 100000, specialties: [{ slug: "dermatology" }, { slug: "cosmetology" }] }),
      doctor({ slug: "b", currency: "INR", fee_audio: 40000, specialties: [{ slug: "dermatology" }] }),
      doctor({ slug: "c", currency: "GBP", fee_video: 4500, specialties: [{ slug: "dermatology" }] }),
      doctor({ slug: "d", currency: "USD", specialties: [{ slug: "cardiology" }] }), // no fees set
    ]);
    expect(fees.get("dermatology")).toEqual([
      { currency: "GBP", amount: 4500 },
      { currency: "INR", amount: 40000 },
    ]);
    expect(fees.get("cosmetology")).toEqual([{ currency: "INR", amount: 50000 }]);
    expect(fees.has("cardiology")).toBe(false);
  });
});

describe("formatPrice", () => {
  it("drops zero minor units for headline prices", () => {
    expect(formatPrice(50000, "INR")).toBe("₹500");
    expect(formatPrice(2550, "GBP")).toBe("£25.50");
  });
});

describe("availability in the patient's time zone", () => {
  // 2026-10-29 20:22 IST = 14:52Z.
  const now = Date.parse("2026-10-29T14:52:00Z");
  const tz = "Asia/Kolkata";

  it("labels the next slot relative to the patient's calendar day", () => {
    expect(nextAvailableDay("2026-10-29T17:30:00Z", tz, now)).toBe("today"); // 23:00 IST same day
    expect(nextAvailableDay("2026-10-29T18:45:00Z", tz, now)).toBe("tomorrow"); // 00:15 IST next day
    expect(nextAvailableDay("2026-11-02T12:30:00Z", tz, now)).toBeNull();
  });

  it("uses the patient's zone, not UTC, to decide what 'today' means", () => {
    // Now = 11:00 EDT / 20:30 IST on the 29th. A 02:00Z slot is 22:00 on the 29th in New York but 07:30 on the 30th in India.
    const at = Date.parse("2026-10-29T15:00:00Z");
    expect(nextAvailableDay("2026-10-30T02:00:00Z", "America/New_York", at)).toBe("today");
    expect(nextAvailableDay("2026-10-30T02:00:00Z", "Asia/Kolkata", at)).toBe("tomorrow");
  });

  it("filters by today, tomorrow and day windows", () => {
    expect(availabilityMatches("2026-10-29T17:30:00Z", "today", tz, now)).toBe(true);
    expect(availabilityMatches("2026-10-29T18:45:00Z", "today", tz, now)).toBe(false);
    expect(availabilityMatches("2026-10-29T18:45:00Z", "tomorrow", tz, now)).toBe(true);
    expect(availabilityMatches("2026-10-31T12:00:00Z", "3", tz, now)).toBe(true); // day 3 = 31 Oct
    expect(availabilityMatches("2026-11-01T12:00:00Z", "3", tz, now)).toBe(false);
    expect(availabilityMatches(null, "7", tz, now)).toBe(false);
    expect(availabilityMatches(null, "", tz, now)).toBe(true);
  });
});

describe("sortDoctors", () => {
  const list: ListedDoctor[] = [
    { doctor: doctor({ slug: "late", years_experience: 20, currency: "INR", fee_video: 100000 }), next: "2026-11-01T10:00:00Z" },
    { doctor: doctor({ slug: "none", years_experience: 30, currency: "INR", fee_video: 30000 }), next: null },
    { doctor: doctor({ slug: "soon", years_experience: 5, currency: "INR", fee_video: 60000 }), next: "2026-10-30T10:00:00Z" },
    { doctor: doctor({ slug: "gbp", years_experience: null, currency: "GBP", fee_video: 4500 }), next: "2026-10-31T10:00:00Z" },
  ];
  const order = (sort: Parameters<typeof sortDoctors>[1]) => sortDoctors(list, sort).map((d) => d.doctor.slug);

  it("puts the earliest available first and doctors without slots last", () => {
    expect(order("available")).toEqual(["soon", "gbp", "late", "none"]);
  });

  it("sorts by experience with unknown experience last", () => {
    expect(order("experience")).toEqual(["none", "late", "soon", "gbp"]);
  });

  it("compares fees only within a currency, grouping currencies", () => {
    expect(order("fee_asc")).toEqual(["gbp", "none", "soon", "late"]);
    expect(order("fee_desc")).toEqual(["gbp", "late", "soon", "none"]);
  });
});
