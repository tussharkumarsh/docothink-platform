"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { parseTemplateForm } from "./template-schema";

function revalidateTemplates() {
  revalidatePath("/doctor/templates");
  revalidatePath("/doctor/appointments/[id]/prescription", "page");
}

/** Create a template, or update one when `template_id` is sent. Reads only template fields from the form. */
export async function saveTemplateAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireApprovedDoctor();
  const parsed = parseTemplateForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { name, items, treatment_plan, advice, follow_up } = parsed.data;
  const values = { name, items, treatment_plan: treatment_plan || null, advice: advice || null, follow_up: follow_up || null };

  const supabase = await createClient();
  const id = z.string().uuid().safeParse(formData.get("template_id"));
  const { data, error } = id.success
    ? await supabase.from("prescription_templates").update(values).eq("id", id.data).select("id")
    : await supabase.from("prescription_templates").insert({ doctor_id: viewer.id, ...values }).select("id");
  if (error?.code === "23505") return { ok: false, error: "You already have a template with this name." };
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "This template no longer exists." };
  revalidateTemplates();
  return { ok: true, message: `Template "${name}" saved.` };
}

export async function deleteTemplateAction(formData: FormData) {
  await requireApprovedDoctor();
  const supabase = await createClient();
  await supabase.from("prescription_templates").delete().eq("id", z.string().uuid().parse(formData.get("template_id")));
  revalidateTemplates();
}
