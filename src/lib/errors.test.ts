import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError for reviews", () => {
  it("explains review rule violations instead of a generic error", () => {
    expect(friendlyError({ message: "REVIEW_EXISTS" })).toBe("You've already reviewed this consultation.");
    expect(friendlyError({ message: "REVIEW_NOT_ALLOWED" })).toBe(
      "Reviews can be left only for completed consultations in the last 30 days.",
    );
    expect(friendlyError({ message: "INVALID_RATING" })).toBe("Choose a rating from 1 to 5 stars.");
    expect(friendlyError({ message: "COMMENT_TOO_LONG" })).toBe("Please keep your comment under 1,000 characters.");
  });
});

describe("friendlyError for bank and KYC details", () => {
  it("names the field that failed validation", () => {
    expect(friendlyError({ message: "INVALID_IFSC" })).toBe("Enter a valid IFSC code, e.g. SBIN0001234.");
    expect(friendlyError({ message: "INVALID_PAN" })).toBe("Enter a valid PAN, e.g. ABCDE1234F.");
    expect(friendlyError({ message: "INVALID_ACCOUNT_NUMBER" })).toBe("Enter a valid account number for the selected country.");
    expect(friendlyError({ message: "MISMATCHED_FIELDS" })).toBe("Some details don't belong to the selected bank country. Clear them and try again.");
    expect(friendlyError({ message: "NOT_PENDING" })).toBe("These details aren't waiting for review.");
    expect(friendlyError({ message: "STALE_DETAILS" })).toBe(
      "The doctor changed these details after you opened the page. Reload and check them again before deciding.",
    );
  });
});

describe("friendlyError for settlement invoices", () => {
  it("explains why an invoice can't be raised", () => {
    expect(friendlyError({ message: "KYC_NOT_VERIFIED" })).toBe("Your bank details need to be verified before you can raise an invoice.");
    expect(friendlyError({ message: "NOTHING_SELECTED" })).toBe("Select at least one consultation.");
    expect(friendlyError({ message: "ENTRY_NOT_INVOICEABLE" })).toBe("One of the selected consultations is no longer available to invoice. Refresh and try again.");
    expect(friendlyError({ message: "MIXED_CURRENCY" })).toBe("An invoice can only include consultations in one currency.");
  });
});
