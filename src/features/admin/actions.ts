"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { CURRENCIES, toMinor } from "@/lib/money";
import { processPendingRefunds } from "@/features/payments/server";
import { isValidTimezone } from "@/lib/time/format";

const uuid = z.string().uuid();
const ok = (message: string): ActionResult => ({ ok: true, message });

async function rpc(name: string, args: Record<string, unknown>): Promise<ActionResult | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  return error ? { ok: false, error: friendlyError(error) } : null;
}

export async function reviewDoctorAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("doctors.manage");
  const parsed = z
    .object({ doctor_id: uuid, decision: z.enum(["start_review", "request_info", "approve", "reject", "suspend", "reinstate"]), note: z.string().trim().max(2000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose an action." };
  const failed = await rpc("review_doctor_application", { p_doctor: parsed.data.doctor_id, p_action: parsed.data.decision, p_note: parsed.data.note || null });
  if (failed) return failed;
  revalidateTag("doctors", "max");
  revalidatePath("/admin/doctors", "layout");
  return ok("Application updated and the doctor has been notified.");
}

export async function reviewCredentialAction(formData: FormData) {
  await requirePermission("doctors.manage");
  const id = uuid.parse(formData.get("credential_id"));
  const status = z.enum(["verified", "rejected", "pending"]).parse(formData.get("status"));
  const note = String(formData.get("note") ?? "").trim() || (status === "rejected" ? "Document not acceptable" : null);
  const supabase = await createClient();
  await supabase.rpc("review_doctor_credential", { p_credential: id, p_status: status, p_note: note });
  revalidatePath("/admin/doctors", "layout");
}

export async function setUserActiveAction(formData: FormData) {
  const role = formData.get("role") === "doctor" ? "doctors.manage" : "patients.manage";
  await requirePermission(role);
  const supabase = await createClient();
  await supabase.rpc("set_user_active", { p_user: uuid.parse(formData.get("user_id")), p_active: formData.get("active") === "true" });
  revalidateTag("doctors", "max");
  revalidatePath("/admin", "layout");
}

export async function adminCancelAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("appointments.manage");
  const parsed = z.object({ appointment_id: uuid, reason: z.string().trim().min(3).max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Give a reason for the cancellation." };
  const failed = await rpc("cancel_appointment", { p_appointment: parsed.data.appointment_id, p_reason: parsed.data.reason });
  if (failed) return failed;
  after(() => processPendingRefunds().catch(() => undefined));
  revalidatePath("/admin/appointments", "layout");
  return ok("Appointment cancelled; a full refund was queued if anything was paid.");
}

export async function decideChangeRequestAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("appointments.manage");
  const parsed = z.object({ request_id: uuid, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose approve or reject." };
  // The database re-validates the slot inside the same transaction that moves the appointment.
  const failed = await rpc("decide_change_request", { p_request: parsed.data.request_id, p_approve: parsed.data.decision === "approve", p_note: parsed.data.note || null });
  if (failed) return failed;
  revalidatePath("/admin/appointments", "layout");
  return ok(parsed.data.decision === "approve" ? "Approved. Both parties have been notified." : "Rejected. The original time is unchanged.");
}

export async function adminRefundAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z.object({ appointment_id: uuid, amount: z.string(), currency: z.string(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter an amount and a reason." };
  const minor = toMinor(parsed.data.amount, parsed.data.currency);
  if (!minor) return { ok: false, error: "Enter a valid amount." };
  const failed = await rpc("admin_refund", { p_appointment: parsed.data.appointment_id, p_amount: minor, p_reason: parsed.data.reason });
  if (failed) return failed;
  after(() => processPendingRefunds().catch(() => undefined));
  revalidatePath("/admin", "layout");
  return ok("Refund queued with the payment provider.");
}

export async function setCommissionAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z
    .object({ doctor_id: uuid.optional().or(z.literal("")), percent: z.coerce.number().min(0).max(100), note: z.string().trim().max(500).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a percentage between 0 and 100." };
  const bps = Math.round(parsed.data.percent * 100);
  const failed = await rpc("set_commission_rule", { p_doctor: parsed.data.doctor_id || null, p_rate_bps: bps, p_note: parsed.data.note || null });
  if (failed) return failed;
  revalidatePath("/admin", "layout");
  return ok(`Commission set to ${bps / 100}% for new bookings.`);
}

export async function createSettlementAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z
    .object({ settlement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: z.enum(CURRENCIES as [string, ...string[]]), cutoff_time: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().refine(isValidTimezone) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a date, currency and cut-off." };
  const cutoff = Temporal.PlainDateTime.from(`${parsed.data.settlement_date}T${parsed.data.cutoff_time}`).toZonedDateTime(parsed.data.timezone).toInstant();
  const now = Temporal.Now.instant();
  const effectiveCutoff = Temporal.Instant.compare(cutoff, now) > 0 ? now : cutoff;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_settlement_batch", { p_settlement_date: parsed.data.settlement_date, p_currency: parsed.data.currency, p_cutoff: effectiveCutoff.toString() });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/finance", "layout");
  return ok(`Settlement batch ready (${String(data).slice(0, 8)}). Running it again for the same date returns the same batch.`);
}

export async function updatePayoutAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z
    .object({
      payout_id: uuid,
      status: z.enum(["under_review", "approved", "processing", "paid", "failed", "on_hold"]),
      reference: z.string().trim().max(200).optional(),
      method: z.string().trim().max(100).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a status." };
  const failed = await rpc("update_payout_status", {
    p_payout: parsed.data.payout_id,
    p_status: parsed.data.status,
    p_reference: parsed.data.reference || null,
    p_method: parsed.data.method || null,
    p_notes: parsed.data.notes || null,
  });
  if (failed) return failed;
  revalidatePath("/admin/finance", "layout");
  return ok("Payout updated.");
}

export async function addAdjustmentAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z
    .object({ doctor_id: uuid, currency: z.enum(CURRENCIES as [string, ...string[]]), direction: z.enum(["credit", "debit"]), amount: z.string(), description: z.string().trim().min(3).max(500) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Fill in every field." };
  const minor = toMinor(parsed.data.amount, parsed.data.currency);
  if (!minor) return { ok: false, error: "Enter a valid amount." };
  const failed = await rpc("add_ledger_adjustment", { p_doctor: parsed.data.doctor_id, p_currency: parsed.data.currency, p_amount: parsed.data.direction === "debit" ? -minor : minor, p_description: parsed.data.description });
  if (failed) return failed;
  revalidatePath("/admin/finance", "layout");
  return ok("Adjustment recorded in the ledger.");
}

export async function saveSpecialtyAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const parsed = z
    .object({
      id: uuid.optional().or(z.literal("")),
      name: z.string().trim().min(2).max(100),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
      description: z.string().trim().max(1000).optional(),
      sort_order: z.coerce.number().int().default(0),
      is_active: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { id, is_active, ...rest } = parsed.data;
  const supabase = await createClient();
  const row = { ...rest, description: rest.description || null, is_active: is_active === "on" };
  const { error } = id ? await supabase.from("specialties").update(row).eq("id", id) : await supabase.from("specialties").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "That slug is already used." : friendlyError(error) };
  revalidateTag("specialties", "max");
  revalidatePath("/admin/specialties");
  return ok("Specialty saved.");
}

const SETTING_SCHEMAS = {
  booking: z.object({ max_horizon_days: z.coerce.number().int().min(1).max(90), payment_hold_minutes: z.coerce.number().int().min(5).max(60) }),
  consultation: z.object({ join_open_minutes_before: z.coerce.number().int().min(0).max(60), join_close_minutes_after: z.coerce.number().int().min(0).max(240), no_show_grace_minutes: z.coerce.number().int().min(0).max(120) }),
  cancellation: z
    .object({ full_refund_hours_before: z.coerce.number().min(0).max(720), partial_refund_hours_before: z.coerce.number().min(0).max(720), partial_refund_percent: z.coerce.number().int().min(0).max(100) })
    .refine((v) => v.partial_refund_hours_before <= v.full_refund_hours_before, "The partial-refund window must be shorter than the full-refund window"),
  uploads: z.object({ max_file_mb: z.coerce.number().int().min(1).max(25) }),
  branding: z.object({ name: z.string().trim().min(1).max(100), support_email: z.string().trim().email(), emergency_note: z.string().trim().max(500) }),
  display: z.object({ admin_timezone: z.string().refine(isValidTimezone, "Invalid time zone") }),
  billing: z.object({
    company_name: z.string().trim().max(200),
    address: z.string().trim().max(500),
    gstin: z.string().trim().toUpperCase().regex(/^([0-9]{2}[A-Z0-9]{13})?$/, "GSTIN must be 15 characters"),
    pan: z.string().trim().toUpperCase().regex(/^([A-Z]{5}[0-9]{4}[A-Z])?$/, "PAN looks like ABCDE1234F"),
    email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  }),
  // Rate in basis points (1000 = 10%); TDS applies to Indian bank accounts only.
  tds: z.object({ rate_bps: z.coerce.number().int().min(0).max(3000) }).transform((v) => ({ ...v, countries: ["IN"] })),
} as const;

export async function saveSettingAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const key = String(formData.get("key")) as keyof typeof SETTING_SCHEMAS;
  const schema = SETTING_SCHEMAS[key];
  if (!schema) return { ok: false, error: "Unknown setting." };
  const values = Object.fromEntries([...formData.entries()].filter(([k]) => k !== "key" && !k.startsWith("$")));
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
  const failed = await rpc("update_platform_setting", { p_key: key, p_value: parsed.data });
  if (failed) return failed;
  revalidatePath("/", "layout");
  return ok("Settings saved and recorded in the audit log.");
}

export async function referralGrantAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("clinical.read");
  const parsed = z.object({ patient_id: uuid, doctor_id: uuid, reason: z.string().trim().min(3).max(1000), days: z.coerce.number().int().min(1).max(365) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a doctor and give a reason." };
  const failed = await rpc("admin_grant_clinical_access", { p_patient: parsed.data.patient_id, p_doctor: parsed.data.doctor_id, p_reason: parsed.data.reason, p_days: parsed.data.days });
  if (failed) return failed;
  revalidatePath("/admin/patients", "layout");
  return ok("Referral access granted; the patient has been notified.");
}

export async function moderateReviewAction(formData: FormData) {
  await requirePermission("reviews.manage");
  const parsed = z.object({ review_id: uuid, status: z.enum(["approved", "hidden"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_review", { p_review: parsed.data.review_id, p_status: parsed.data.status });
  if (error) console.error("moderate_review failed", error.code);
  revalidatePath("/admin/reviews");
  revalidateTag("doctors", "max");
}

export async function reviewKycAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z
    .object({
      doctor_id: uuid,
      decision: z.enum(["verify", "request_changes"]),
      note: z.string().trim().max(1000).optional(),
      // The submission the admin was looking at; the database refuses if the doctor changed it since.
      submitted_at: z.string().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a decision." };
  const failed = await rpc("review_private_details", {
    p_doctor: parsed.data.doctor_id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note || null,
    p_expected_submitted_at: parsed.data.submitted_at,
  });
  if (failed) return failed;
  revalidatePath(`/admin/doctors/${parsed.data.doctor_id}`);
  return ok(parsed.data.decision === "verify" ? "Bank details verified. The doctor has been notified." : "Changes requested. The doctor has been notified.");
}

export type RevealedBank = { account_number: string | null; routing_number: string | null; pan: string | null; tax_id: string | null };

/** Full bank/tax numbers, returned only in this action's response (never rendered into the page). Audited in SQL. */
export async function revealBankAction(_: ActionResult<RevealedBank>, formData: FormData): Promise<ActionResult<RevealedBank>> {
  await requirePermission("finance.manage");
  const id = uuid.safeParse(formData.get("doctor_id"));
  if (!id.success) return { ok: false, error: "Unknown doctor." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_bank_details", { p_doctor: id.data });
  if (error) return { ok: false, error: friendlyError(error) };
  const row = (data as RevealedBank[] | null)?.[0];
  if (!row) return { ok: false, error: "No bank details on file." };
  return { ok: true, data: row };
}

export async function rejectInvoiceAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePermission("finance.manage");
  const parsed = z.object({ payout_id: uuid, reason: z.string().trim().min(3, "Give the doctor a reason").max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Give a reason." };
  const failed = await rpc("reject_invoice", { p_payout: parsed.data.payout_id, p_reason: parsed.data.reason });
  if (failed) return failed;
  revalidatePath("/admin/finance", "layout");
  return ok("Invoice rejected. The consultations are released and the doctor has been notified.");
}

export type RevealedInvoiceBank = {
  account_holder_name: string | null; bank_name: string | null; account_number: string | null; ifsc: string | null;
  sort_code: string | null; routing_number: string | null; account_type: string | null; pan: string | null; tax_id: string | null;
};

/** Full details of the account an invoice was raised with (the one to pay). Audited in SQL; returned only in this response. */
export async function revealInvoiceBankAction(_: ActionResult<RevealedInvoiceBank>, formData: FormData): Promise<ActionResult<RevealedInvoiceBank>> {
  await requirePermission("finance.manage");
  const id = uuid.safeParse(formData.get("payout_id"));
  if (!id.success) return { ok: false, error: "Unknown invoice." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_invoice_bank", { p_payout: id.data });
  if (error) return { ok: false, error: friendlyError(error) };
  const row = (data as RevealedInvoiceBank[] | null)?.[0];
  return row ? { ok: true, data: row } : { ok: false, error: "No bank details on this invoice." };
}
