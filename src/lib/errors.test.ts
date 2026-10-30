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
