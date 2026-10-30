import { describe, expect, it } from "vitest";
import { demoEnabled } from "./demo-setting";

describe("demoEnabled", () => {
  it("is on only for an explicit enabled: true setting", () => {
    expect(demoEnabled({ enabled: true })).toBe(true);
    expect(demoEnabled({ enabled: false })).toBe(false);
    expect(demoEnabled({ enabled: "true" })).toBe(false);
    expect(demoEnabled(null)).toBe(false);
    expect(demoEnabled(undefined)).toBe(false);
  });
});
