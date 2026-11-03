import { z } from "zod";
import { MAX_TEMPLATE_ITEMS, TEXT_LIMITS } from "./templates";

const itemSchema = z.object({
  medication_name: z.string().min(1).max(200),
  strength: z.string().max(100).optional(),
  dosage_form: z.string().max(100).optional(),
  dose: z.string().max(100).optional(),
  route: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  duration: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
});

const templateSchema = z
  .object({
    name: z.string().min(1, "Give the template a name.").max(80, "Keep the name to 80 characters."),
    items: z.array(itemSchema).max(MAX_TEMPLATE_ITEMS, `A template can hold ${MAX_TEMPLATE_ITEMS} medicines.`),
    treatment_plan: z.string().max(TEXT_LIMITS.treatment_plan, "The treatment plan is too long."),
    advice: z.string().max(TEXT_LIMITS.advice, "The advice is too long."),
    follow_up: z.string().max(TEXT_LIMITS.follow_up, "The follow-up is too long."),
  })
  .refine((t) => t.items.length > 0 || t.treatment_plan || t.advice || t.follow_up, "Add a medicine or some text first.");

export type TemplateInput = z.infer<typeof templateSchema>;

/** Reads only template fields, so saving from a whole prescription form can't pick up patient details. */
export function parseTemplateForm(formData: FormData): { ok: true; data: TemplateInput } | { ok: false; error: string } {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  const rows: Record<number, Record<string, string>> = {};
  for (const [name, raw] of formData.entries()) {
    const match = name.match(/^items\.(\d+)\.(\w+)$/);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (match && text) (rows[Number(match[1])] ??= {})[match[2]] = text;
  }
  const items = Object.keys(rows).map(Number).sort((a, b) => a - b).map((k) => rows[k]);
  if (items.some((row) => !row.medication_name)) return { ok: false, error: "Each medicine needs a name." };

  const parsed = templateSchema.safeParse({
    name: value("name"),
    items,
    treatment_plan: value("treatment_plan"),
    advice: value("advice"),
    follow_up: value("follow_up"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template's fields." };
  return { ok: true, data: parsed.data };
}
