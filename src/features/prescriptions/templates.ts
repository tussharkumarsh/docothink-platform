/** Applying a prescription template to the editor's current values. Pure, and safe to load in the browser. */

export const MAX_RX_ITEMS = 30;
export const MAX_TEMPLATE_ITEMS = 20;
export const TEXT_LIMITS = { treatment_plan: 5000, advice: 5000, follow_up: 1000 } as const;

export const EMPTY_ITEM = { medication_name: "", strength: "", dosage_form: "", dose: "", route: "", frequency: "", duration: "", instructions: "" };
export type TemplateItem = Partial<Record<keyof typeof EMPTY_ITEM, string | null>>;

export type Template = {
  id: string;
  name: string;
  items: TemplateItem[];
  treatment_plan: string | null;
  advice: string | null;
  follow_up: string | null;
};

type TextField = keyof typeof TEXT_LIMITS;
const TEXT_FIELDS = Object.keys(TEXT_LIMITS) as TextField[];
const TEXT_LABELS: Record<TextField, string> = { treatment_plan: "Treatment plan", advice: "Advice", follow_up: "Follow-up" };

export type MergeForm = { items: TemplateItem[] } & Record<TextField, string>;
export type MergeResult = ({ ok: true; items: TemplateItem[] } & Record<TextField, string>) | { ok: false; error: string };

const isEmptyRow = (item: TemplateItem) => Object.values(item).every((v) => !v?.trim());

/**
 * Medicines are added after any the doctor has typed (all-empty rows are removed). Text goes below what's there
 * and never replaces it. Anything else on the form stays out of this: templates can't touch clinical fields.
 */
export function mergeTemplate(form: MergeForm, template: Template): MergeResult {
  const items = [...form.items.filter((i) => !isEmptyRow(i)), ...template.items];
  if (items.length > MAX_RX_ITEMS) {
    return { ok: false, error: `That would make more than ${MAX_RX_ITEMS} medicines. Remove some first.` };
  }
  const text = {} as Record<TextField, string>;
  for (const field of TEXT_FIELDS) {
    const current = form[field];
    const added = template[field]?.trim();
    text[field] = !added ? current : current.trim() ? `${current}\n${added}` : added;
    if (text[field].length > TEXT_LIMITS[field]) {
      return { ok: false, error: `${TEXT_LABELS[field]} would be longer than ${TEXT_LIMITS[field]} characters. Shorten it first.` };
    }
  }
  return { ok: true, items, ...text };
}
