import { describe, expect, it } from "vitest";
import { suggestSpecialty } from "./find-care";

const c = (specialty_slug: string | null, slug = specialty_slug ?? "x") => ({ slug, specialty_slug });

describe("suggestSpecialty", () => {
  it("returns the specialty of the selected concern for adults", () => {
    expect(suggestSpecialty([c("dermatology")], false)).toBe("dermatology");
  });

  it("keeps child-friendly specialties for children", () => {
    expect(suggestSpecialty([c("dermatology")], true)).toBe("dermatology");
    expect(suggestSpecialty([c("ent")], true)).toBe("ent");
  });

  it("routes other specialties to Pediatrics for children", () => {
    expect(suggestSpecialty([c("cardiology")], true)).toBe("pediatrics");
  });

  it("picks the most frequent specialty, breaking ties by first selected", () => {
    expect(suggestSpecialty([c("dermatology", "acne"), c("cardiology", "bp"), c("cardiology", "palpitations")], false)).toBe("cardiology");
    expect(suggestSpecialty([c("ent", "sinus"), c("dermatology", "acne")], false)).toBe("ent");
  });

  it("returns null when nothing usable is selected", () => {
    expect(suggestSpecialty([], false)).toBeNull();
    expect(suggestSpecialty([c(null)], false)).toBeNull();
  });
});
