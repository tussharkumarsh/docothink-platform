"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/viewer";
import type { ActionResult } from "@/lib/errors";
import { REVIEW_OF_SYSTEMS, sectionSchemas, type SectionKey } from "./schema";

/** Turns `items.0.name` style form fields into nested objects/arrays. */
function formToObject(formData: FormData, section: SectionKey) {
  const out: Record<string, unknown> = {};
  if (section === "review_of_systems") {
    for (const key of Object.keys(REVIEW_OF_SYSTEMS)) out[key] = formData.getAll(`ros.${key}`).map(String);
    return out;
  }
  const items: Record<number, Record<string, string>> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || name.startsWith("$") || name === "section" || name === "version" || name === "intent") continue;
    const m = name.match(/^items\.(\d+)\.(\w+)$/);
    if (m) (items[Number(m[1])] ??= {})[m[2]] = value;
    else out[name] = value;
  }
  const rows = Object.keys(items)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => items[i])
    .filter((row) => Object.values(row).some((v) => v.trim() !== ""));
  if (rows.length || "items" in sectionSchemas[section].shape) out.items = rows;
  return out;
}

export async function saveMedicalSectionAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("patient");
  const section = String(formData.get("section")) as SectionKey;
  if (!(section in sectionSchemas)) return { ok: false, error: "Unknown section." };
  const parsed = sectionSchemas[section].safeParse(formToObject(formData, section));
  if (!parsed.success) {
    return { ok: false, error: "Please check this section: some entries are missing a required name or are too long." };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("patient_medical_profiles")
    .select("data, completed_sections, version")
    .eq("patient_id", viewer.id)
    .single();
  if (!current) return { ok: false, error: "Medical profile not found." };
  if (String(current.version) !== String(formData.get("version"))) {
    return { ok: false, error: "This profile was updated in another tab. Reload the page to see the latest version." };
  }

  const markComplete = formData.get("intent") === "complete";
  const completed = new Set<string>(current.completed_sections);
  if (markComplete) completed.add(section);

  // Optimistic concurrency: only update if nobody saved in between (version bumps on every update).
  const { data: updated, error } = await supabase
    .from("patient_medical_profiles")
    .update({ data: { ...(current.data as object), [section]: parsed.data }, completed_sections: [...completed] })
    .eq("patient_id", viewer.id)
    .eq("version", current.version)
    .select("version");
  if (error) return { ok: false, error: "Could not save. Please try again." };
  if (!updated?.length) return { ok: false, error: "This profile was updated elsewhere. Reload and try again." };

  revalidatePath("/patient/medical-profile");
  return { ok: true, message: markComplete ? "Saved and marked complete." : "Draft saved. You can come back to finish it later." };
}
