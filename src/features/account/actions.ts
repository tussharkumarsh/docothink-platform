"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireRole } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { isValidTimezone } from "@/lib/time/format";

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const phone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[0-9 ()-]{6,20}$/.test(v), "Enter a valid phone number, e.g. +1 212 555 0101");
const country = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a two-letter country code, e.g. US, GB, IN");

const accountSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(200),
  phone,
  timezone: z.string().refine(isValidTimezone, "Choose a valid IANA time zone"),
  country,
  preferred_language: z.string().trim().min(2).max(35).default("en"),
});

export async function updateAccountAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in." };
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", viewer.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

const patientSchema = z.object({
  date_of_birth: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (!Number.isNaN(Date.parse(v)) && Date.parse(v) < Date.now()), "Enter a valid date of birth"),
  sex: z.enum(["", "female", "male", "intersex", "prefer_not_to_say"]).transform((v) => (v ? v : null)),
  address_line1: optional(200),
  address_line2: optional(200),
  city: optional(100),
  region: optional(100),
  postal_code: optional(20),
  country,
  emergency_contact_name: optional(200),
  emergency_contact_relationship: optional(100),
  emergency_contact_phone: phone,
});

export async function updatePatientDetailsAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("patient");
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("patient_profiles").update(parsed.data).eq("user_id", viewer.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/patient", "layout");
  return { ok: true, message: "Saved." };
}

export async function shareRecordsAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("patient");
  const parsed = z
    .object({ doctor_id: z.string().uuid("Choose a doctor"), reason: z.string().trim().min(3, "Add a short reason").max(1000), days: z.coerce.number().int().min(1).max(365) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("share_records_with_doctor", { p_doctor: parsed.data.doctor_id, p_reason: parsed.data.reason, p_days: parsed.data.days });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/patient/sharing");
  return { ok: true, message: "Your records are now shared with this doctor." };
}

export async function revokeShareAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("grant_id"));
  const supabase = await createClient();
  await supabase.rpc("revoke_clinical_access", { p_grant: id });
  revalidatePath("/patient/sharing");
}

export async function markNotificationsReadAction() {
  const viewer = await getViewer();
  if (!viewer) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).is("read_at", null);
  revalidatePath("/", "layout");
}
