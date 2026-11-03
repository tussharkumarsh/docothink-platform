import { describe, expect, it } from "vitest";
import { EMPTY_ITEM, MAX_RX_ITEMS, mergeTemplate, type Template } from "./templates";
import { parseTemplateForm } from "./template-schema";

const med = (medication_name: string) => ({ ...EMPTY_ITEM, medication_name });
const template = (over: Partial<Template> = {}): Template => ({
  id: "t",
  name: "Viral fever",
  items: [med("Paracetamol")],
  treatment_plan: null,
  advice: null,
  follow_up: null,
  ...over,
});
const form = (over = {}) => ({ items: [], treatment_plan: "", advice: "", follow_up: "", ...over });

describe("mergeTemplate", () => {
  it("removes all-empty rows and appends the template's medicines", () => {
    const r = mergeTemplate(form({ items: [{ ...EMPTY_ITEM }, med("Cetirizine"), { ...EMPTY_ITEM, dose: "  " }] }), template());
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.items.map((i) => i.medication_name)).toEqual(["Cetirizine", "Paracetamol"]);
  });

  it("keeps a row with any field typed, even without a medicine name", () => {
    const r = mergeTemplate(form({ items: [{ ...EMPTY_ITEM, dose: "1 tablet" }] }), template());
    if (r.ok) expect(r.items).toHaveLength(2);
    expect(r.ok).toBe(true);
  });

  it("fills an empty text field with the template's text", () => {
    const r = mergeTemplate(form({ advice: "   " }), template({ advice: "Rest and fluids" }));
    expect(r).toMatchObject({ ok: true, advice: "Rest and fluids" });
  });

  it("keeps typed text and adds the template's below it", () => {
    const r = mergeTemplate(form({ advice: "Avoid dairy" }), template({ advice: "Rest and fluids" }));
    expect(r).toMatchObject({ ok: true, advice: "Avoid dairy\nRest and fluids" });
  });

  it("changes nothing when the template's text is empty", () => {
    const r = mergeTemplate(form({ treatment_plan: "Typed plan", follow_up: "Typed" }), template({ treatment_plan: "", follow_up: null }));
    expect(r).toMatchObject({ ok: true, treatment_plan: "Typed plan", follow_up: "Typed" });
  });

  it("refuses to go past the prescription's medicine limit", () => {
    const items = Array.from({ length: MAX_RX_ITEMS }, (_, i) => med(`M${i}`));
    const r = mergeTemplate(form({ items }), template());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(MAX_RX_ITEMS));
  });

  it("refuses when added text would pass a field's limit, instead of being cut off at save", () => {
    const r = mergeTemplate(form({ follow_up: "x".repeat(990) }), template({ follow_up: "y".repeat(20) }));
    expect(r.ok).toBe(false);
  });

  it("returns only the fields a template may change", () => {
    const r = mergeTemplate(form({ diagnosis: "Typed diagnosis" }), template());
    expect(Object.keys(r).sort()).toEqual(["advice", "follow_up", "items", "ok", "treatment_plan"]);
  });
});

function fd(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("parseTemplateForm", () => {
  it("keeps only template fields from a whole prescription form", () => {
    const r = parseTemplateForm(
      fd({
        name: "  Viral fever ",
        "items.0.medication_name": "Paracetamol",
        "items.0.dose": "1 tablet",
        treatment_plan: "Plan",
        advice: "Advice",
        follow_up: "3 days",
        diagnosis: "Patient diagnosis",
        presenting_symptoms: "Patient symptoms",
        clinical_observations: "Patient observations",
        relevant_history: "Patient history",
        amendment_reason: "Reason",
        prescription_id: "abc",
      }),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        name: "Viral fever",
        items: [{ medication_name: "Paracetamol", dose: "1 tablet" }],
        treatment_plan: "Plan",
        advice: "Advice",
        follow_up: "3 days",
      },
    });
  });

  it("drops all-empty medicine rows", () => {
    const r = parseTemplateForm(fd({ name: "A", "items.0.medication_name": " ", "items.0.dose": "", advice: "Rest" }));
    expect(r).toMatchObject({ ok: true, data: { items: [] } });
  });

  it("rejects a row with details but no medicine name", () => {
    expect(parseTemplateForm(fd({ name: "A", "items.0.dose": "1 tablet" }))).toEqual({ ok: false, error: "Each medicine needs a name." });
  });

  it("rejects an empty template, a blank name and a long name", () => {
    expect(parseTemplateForm(fd({ name: "A" })).ok).toBe(false);
    expect(parseTemplateForm(fd({ name: "  ", advice: "Rest" })).ok).toBe(false);
    expect(parseTemplateForm(fd({ name: "x".repeat(81), advice: "Rest" })).ok).toBe(false);
  });

  it("rejects more than 20 medicines", () => {
    const entries: Record<string, string> = { name: "A" };
    for (let i = 0; i < 21; i++) entries[`items.${i}.medication_name`] = `M${i}`;
    expect(parseTemplateForm(fd(entries)).ok).toBe(false);
  });
});
