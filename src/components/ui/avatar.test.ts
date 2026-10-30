import { describe, expect, it } from "vitest";
import { initials } from "./avatar";

describe("initials", () => {
  it("uses first and last name, ignoring a Dr title", () => {
    expect(initials("Anjali Mehta")).toBe("AM");
    expect(initials("Dr. James Van Clarke")).toBe("JC");
    expect(initials("Prakash")).toBe("P");
    expect(initials("  ")).toBe("?");
  });
});
