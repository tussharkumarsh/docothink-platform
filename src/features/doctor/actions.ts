"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedDoctor, requireRole } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { CURRENCIES, toMinor } from "@/lib/money";
import { isValidTimezone } from "@/lib/time/format";
import { CONSULTATION_MODES } from "@/lib/domain";
import { Temporal } from "temporal-polyfill";

const TERMS_VERSION = "2026-10";

const lines = (v: string | undefined) =>
  (v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const profileSchema = z.object({
  title: z.string().trim().max(20).default("Dr."),
  display_name: z.string().trim().min(2, "Enter your name as patients should see it").max(200),
  headline: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(5000).optional(),
  qualifications: z.string().trim().max(500).optional(),
  years_experience: z.coerce.number().int().min(0).max(80).optional().or(z.literal("").transform(() => undefined)),
  languages: z.string().optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Two-letter country code").optional().or(z.literal("")),
  timezone: z.string().refine(isValidTimezone, "Choose a valid IANA time zone"),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  fee_chat: z.string().optional(),
  fee_audio: z.string().optional(),
  fee_video: z.string().optional(),
  registration_number: z.string().trim().max(100).optional(),
  registration_council: z.string().trim().max(200).optional(),
  registration_country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Two-letter country code").optional().or(z.literal("")),
  education: z.string().max(5000).optional(),
  experience: z.string().max(5000).optional(),
});

export async function updateDoctorProfileAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("doctor");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const fees: Record<string, number | null> = {};
  for (const mode of CONSULTATION_MODES) {
    const raw = d[`fee_${mode}`]?.trim();
    if (!raw) fees[`fee_${mode}`] = null;
    else {
      const minor = toMinor(raw, d.currency);
      if (minor == null || minor <= 0) return { ok: false, error: "Fees must be positive amounts.", fieldErrors: { [`fee_${mode}`]: ["Enter a valid amount"] } };
      fees[`fee_${mode}`] = minor;
    }
  }
  // "MBBS | AIIMS New Delhi | 2014" per line; keeps the form simple without a nested editor.
  const education = lines(d.education).map((l) => {
    const [degree, institution, year] = l.split("|").map((s) => s.trim());
    return { degree, institution: institution ?? "", year: year && /^\d{4}$/.test(year) ? Number(year) : undefined };
  });
  const experience = lines(d.experience).map((l) => {
    const [position, organization, years] = l.split("|").map((s) => s.trim());
    return { position, organization: organization ?? "", years };
  });

  const supabase = await createClient();
  const update: Record<string, unknown> = {
    title: d.title,
    display_name: d.display_name,
    headline: d.headline || null,
    bio: d.bio || null,
    qualifications: d.qualifications || null,
    years_experience: d.years_experience ?? null,
    languages: (d.languages ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
    country: d.country || null,
    timezone: d.timezone,
    currency: d.currency,
    education,
    experience,
    ...fees,
  };
  // Registration fields are locked after approval (database trigger); only send them while editable.
  if (viewer.doctorStatus !== "approved" && viewer.doctorStatus !== "suspended") {
    Object.assign(update, {
      registration_number: d.registration_number || null,
      registration_council: d.registration_council || null,
      registration_country: d.registration_country || null,
    });
  }
  const { error } = await supabase.from("doctor_profiles").update(update).eq("user_id", viewer.id);
  if (error) return { ok: false, error: friendlyError(error) };
  await supabase.from("profiles").update({ full_name: d.display_name, timezone: d.timezone }).eq("id", viewer.id);
  revalidateTag("doctors", "max");
  revalidatePath("/doctor", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function setSpecialtiesAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("doctor");
  const ids = formData.getAll("specialty_ids").map(String);
  const primary = String(formData.get("primary") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_doctor_specialties", { p_specialty_ids: ids, p_primary: primary || ids[0] || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateTag("doctors", "max");
  revalidatePath("/doctor", "layout");
  return { ok: true, message: "Specialties saved." };
}

export async function submitApplicationAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("doctor");
  if (formData.get("accept_terms") !== "on") return { ok: false, error: "Please accept the doctor terms to submit." };
  const supabase = await createClient();
  await supabase.from("doctor_profiles").update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION }).eq("user_id", viewer.id);
  const { error } = await supabase.rpc("submit_doctor_application");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/doctor", "layout");
  return { ok: true, message: "Application submitted. We'll email you when it's reviewed." };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:MM");

export async function addRuleAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("doctor");
  const parsed = z
    .object({
      weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one day"),
      start_time: time,
      end_time: time,
      slot_minutes: z.coerce.number().int().min(10).max(180),
      buffer_minutes: z.coerce.number().int().min(0).max(120),
      modes: z.array(z.enum(CONSULTATION_MODES)).min(1, "Choose at least one consultation type"),
      timezone: z.string().refine(isValidTimezone),
    })
    .refine((v) => v.end_time > v.start_time, { message: "End time must be after start time", path: ["end_time"] })
    .safeParse({
      weekdays: formData.getAll("weekdays"),
      modes: formData.getAll("modes"),
      start_time: formData.get("start_time"),
      end_time: formData.get("end_time"),
      slot_minutes: formData.get("slot_minutes"),
      buffer_minutes: formData.get("buffer_minutes"),
      timezone: formData.get("timezone"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { weekdays, ...rule } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_availability_rules")
    .insert(weekdays.map((weekday) => ({ ...rule, weekday, doctor_id: viewer.id })));
  if (error) return { ok: false, error: friendlyError(error, "Could not add the window. Check it doesn't overlap an existing one and fits at least one slot.") };
  revalidatePath("/doctor/availability");
  return { ok: true, message: "Availability added." };
}

export async function deleteRuleAction(formData: FormData) {
  await requireRole("doctor");
  const supabase = await createClient();
  await supabase.from("doctor_availability_rules").delete().eq("id", z.string().uuid().parse(formData.get("rule_id")));
  revalidatePath("/doctor/availability");
}

export async function addExceptionAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("doctor");
  const parsed = z
    .object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start_time: time.optional().or(z.literal("")),
      end_time: time.optional().or(z.literal("")),
      reason: z.string().trim().max(200).optional(),
      timezone: z.string().refine(isValidTimezone),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter the dates to block." };
  const d = parsed.data;
  // Convert the doctor's local dates/times to instants using real zone rules (DST-safe).
  const start = Temporal.PlainDateTime.from(`${d.start_date}T${d.start_time || "00:00"}`).toZonedDateTime(d.timezone).toInstant();
  const endLocal = d.end_time && d.end_time !== "24:00" ? Temporal.PlainDateTime.from(`${d.end_date}T${d.end_time}`) : Temporal.PlainDate.from(d.end_date).add({ days: 1 }).toPlainDateTime();
  const end = endLocal.toZonedDateTime(d.timezone).toInstant();
  if (Temporal.Instant.compare(end, start) <= 0) return { ok: false, error: "The end must be after the start." };

  const supabase = await createClient();
  const { data: clash } = await supabase
    .from("appointments")
    .select("id")
    .eq("doctor_id", viewer.id)
    .in("status", ["confirmed", "in_progress"])
    .lt("start_at", end.toString())
    .gt("end_at", start.toString())
    .limit(1);
  const { error } = await supabase.from("doctor_availability_exceptions").insert({ doctor_id: viewer.id, starts_at: start.toString(), ends_at: end.toString(), reason: d.reason || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/doctor/availability");
  return {
    ok: true,
    message: clash?.length
      ? "Time blocked for new bookings. You still have confirmed appointments in this period. Contact support to move or cancel them."
      : "Time blocked.",
  };
}

export async function deleteExceptionAction(formData: FormData) {
  await requireRole("doctor");
  const supabase = await createClient();
  await supabase.from("doctor_availability_exceptions").delete().eq("id", z.string().uuid().parse(formData.get("exception_id")));
  revalidatePath("/doctor/availability");
}

export async function updateBookingSettingsAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("doctor");
  const parsed = z
    .object({
      booking_horizon_days: z.coerce.number().int().min(1).max(60),
      min_notice_minutes: z.coerce.number().int().min(0).max(10080),
      is_accepting_bookings: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the values." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_profiles")
    .update({ booking_horizon_days: parsed.data.booking_horizon_days, min_notice_minutes: parsed.data.min_notice_minutes, is_accepting_bookings: parsed.data.is_accepting_bookings === "on" })
    .eq("user_id", viewer.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateTag("doctors", "max");
  revalidatePath("/doctor/availability");
  return { ok: true, message: "Booking settings saved." };
}

// ---------------------------------------------------------------------------
// Consultations and prescriptions
// ---------------------------------------------------------------------------
export async function completeConsultationAction(formData: FormData) {
  await requireApprovedDoctor();
  const id = z.string().uuid().parse(formData.get("appointment_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_consultation", { p_appointment: id });
  if (error) redirect(`/doctor/appointments/${id}?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath(`/doctor/appointments/${id}`);
  redirect(`/doctor/appointments/${id}/prescription`);
}

export async function openPrescriptionAction(formData: FormData) {
  await requireApprovedDoctor();
  const id = z.string().uuid().parse(formData.get("appointment_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_prescription_draft", { p_appointment: id });
  if (error) redirect(`/doctor/appointments/${id}?error=${encodeURIComponent(friendlyError(error))}`);
  redirect(`/doctor/appointments/${id}/prescription`);
}

const itemSchema = z.object({
  medication_name: z.string().trim().min(1).max(200),
  strength: z.string().trim().max(100).optional(),
  dosage_form: z.string().trim().max(100).optional(),
  dose: z.string().trim().max(100).optional(),
  route: z.string().trim().max(100).optional(),
  frequency: z.string().trim().max(100).optional(),
  duration: z.string().trim().max(100).optional(),
  instructions: z.string().trim().max(1000).optional(),
});

export async function savePrescriptionAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireApprovedDoctor();
  const id = z.string().uuid().parse(formData.get("prescription_id"));
  const text = (k: string, max: number) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? v.slice(0, max) : null;
  };
  const rows: Record<number, Record<string, string>> = {};
  for (const [name, value] of formData.entries()) {
    const m = name.match(/^items\.(\d+)\.(\w+)$/);
    if (m && typeof value === "string") (rows[Number(m[1])] ??= {})[m[2]] = value;
  }
  const items = Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => rows[k])
    .filter((r) => r.medication_name?.trim());
  const parsedItems = z.array(itemSchema).max(30).safeParse(items);
  if (!parsedItems.success) return { ok: false, error: "Each medicine needs a name; fields must be shorter." };

  const supabase = await createClient();
  // RLS + column grants: only the author's own draft, only clinical text columns.
  const { data: updated, error } = await supabase
    .from("prescriptions")
    .update({
      presenting_symptoms: text("presenting_symptoms", 5000),
      clinical_observations: text("clinical_observations", 5000),
      relevant_history: text("relevant_history", 5000),
      diagnosis: text("diagnosis", 2000),
      treatment_plan: text("treatment_plan", 5000),
      advice: text("advice", 5000),
      follow_up: text("follow_up", 1000),
      amendment_reason: text("amendment_reason", 1000),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "This prescription can no longer be edited." };

  await supabase.from("prescription_items").delete().eq("prescription_id", id);
  if (parsedItems.data.length) {
    const { error: itemError } = await supabase
      .from("prescription_items")
      .insert(parsedItems.data.map((item, position) => ({ ...item, position, prescription_id: id })));
    if (itemError) return { ok: false, error: "Could not save the medicines." };
  }

  if (formData.get("intent") === "finalize") {
    const { error: finError } = await supabase.rpc("finalize_prescription", { p_prescription: id });
    if (finError) return { ok: false, error: friendlyError(finError) };
    revalidatePath("/doctor", "layout");
    return { ok: true, message: "Prescription finalised and shared with the patient." };
  }
  return { ok: true, message: "Draft saved." };
}

export async function amendPrescriptionAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireApprovedDoctor();
  const parsed = z
    .object({ prescription_id: z.string().uuid(), reason: z.string().trim().min(3, "Give a reason for the amendment").max(1000) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Give a reason for the amendment." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("amend_prescription", { p_prescription: parsed.data.prescription_id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/doctor", "layout");
  return { ok: true, message: "Amendment draft created below." };
}
