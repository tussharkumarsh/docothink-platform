import { describe, expect, it } from "vitest";
import { ratingDistribution } from "./summary";

describe("ratingDistribution", () => {
  it("counts each star level", () => {
    expect(ratingDistribution([5, 5, 4, 1])).toEqual({
      counts: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 1 },
      total: 4,
    });
  });

  it("ignores out-of-range values and handles no ratings", () => {
    expect(ratingDistribution([])).toEqual({ counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, total: 0 });
    expect(ratingDistribution([0, 6, 3]).total).toBe(1);
  });
});
