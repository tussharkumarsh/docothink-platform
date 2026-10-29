"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { publicEnv } from "@/lib/env";
import { getPaymentProvider, paymentsConfigured, testPaymentsEnabled } from "@/lib/payments";
import { processPendingRefunds } from "@/features/payments/server";
import { isValidTimezone } from "@/lib/time/format";
import { CONSULTATION_MODES, MODE_LABELS, type ConsultationMode } from "@/lib/domain";

const bookingSchema = z.object({
  doctor_id: z.string().uuid(),
  start: z.string().datetime({ offset: true }),
  mode: z.enum(CONSULTATION_MODES),
  reason: z.string().trim().min(5, "Please describe the reason for your visit (at least a few words)").max(4000),
  symptoms_duration: z.string().trim().max(200).optional(),
  timezone: z.string().refine(isValidTimezone, "Choose a valid time zone"),
  consent: z.literal("on", { message: "Please confirm you understand this is not an emergency service" }),
});

export async function bookAppointmentAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("patient");
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  // Doctor, fee, slot validity and availability are all decided by the database.
  const { data: appointment, error } = await supabase.rpc("book_appointment", {
    p_doctor: parsed.data.doctor_id,
    p_start: parsed.data.start,
    p_mode: parsed.data.mode,
    p_reason: parsed.data.reason,
    p_patient_timezone: parsed.data.timezone,
    p_symptoms_duration: parsed.data.symptoms_duration || null,
  });
  if (error || !appointment) return { ok: false, error: friendlyError(error) };

  // Keep the patient's preferred zone in sync with what they booked in.
  await supabase.from("profiles").update({ timezone: parsed.data.timezone }).eq("id", (appointment as { patient_id: string }).patient_id);

  await startCheckout((appointment as { id: string }).id, "booking");
  return { ok: true };
}

/** Creates the payment record (amount computed in SQL) and redirects to the provider. */
async function startCheckout(appointmentId: string, purpose: "booking" | "upgrade", upgradeTo?: ConsultationMode): Promise<never> {
  const viewer = await requireRole("patient");
  if (testPaymentsEnabled()) return recordTestPayment(appointmentId, purpose, upgradeTo);
  const detailUrl = `/patient/appointments/${appointmentId}`;
  const provider = getPaymentProvider();
  if (!provider || !paymentsConfigured()) redirect(`${detailUrl}?payment=unconfigured`);

  const supabase = await createClient();
  const { data: payment, error } = await supabase.rpc("create_payment_record", {
    p_appointment: appointmentId,
    p_purpose: purpose,
    p_upgrade_to: upgradeTo ?? null,
    p_provider: "stripe",
  });
  if (error || !payment) redirect(`${detailUrl}?payment_error=${encodeURIComponent(friendlyError(error))}`);

  const p = payment as { id: string; amount: number; currency: string };
  let url: string;
  try {
    const checkout = await provider.createCheckout({
      paymentId: p.id,
      amountMinor: p.amount,
      currency: p.currency,
      description: purpose === "upgrade" ? `Consultation upgrade to ${MODE_LABELS[upgradeTo!]}` : "Online medical consultation",
      customerEmail: viewer.email,
      successUrl: `${publicEnv.siteUrl}${detailUrl}?payment=processing`,
      cancelUrl: `${publicEnv.siteUrl}${detailUrl}?payment=cancelled`,
    });
    await createAdminClient().rpc("set_payment_checkout", { p_payment: p.id, p_checkout_id: checkout.checkoutId });
    url = checkout.url;
  } catch (e) {
    console.error("checkout creation failed", (e as { code?: string }).code ?? "error");
    redirect(`${detailUrl}?payment_error=${encodeURIComponent("The payment provider is unavailable. Please try again.")}`);
  }
  redirect(url);
}

export async function payAppointmentAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("appointment_id"));
  await startCheckout(id, "booking");
}

export async function upgradeAppointmentAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("appointment_id"));
  const mode = z.enum(CONSULTATION_MODES).parse(formData.get("mode"));
  await startCheckout(id, "upgrade", mode);
}

/**
 * Test payment mode: records the database-computed amount as paid without charging anyone, through the
 * same create_payment_record / confirm_payment path as the Stripe webhook. Rows use provider "manual".
 */
async function recordTestPayment(appointmentId: string, purpose: "booking" | "upgrade", upgradeTo?: ConsultationMode): Promise<never> {
  const detailUrl = `/patient/appointments/${appointmentId}`;
  const supabase = await createClient();
  const { data: payment, error } = await supabase.rpc("create_payment_record", {
    p_appointment: appointmentId,
    p_purpose: purpose,
    p_upgrade_to: upgradeTo ?? null,
    p_provider: "manual",
  });
  if (error || !payment) redirect(`${detailUrl}?payment_error=${encodeURIComponent(friendlyError(error))}`);
  const p = payment as { id: string; amount: number; currency: string };
  const { data: outcome, error: confirmError } = await createAdminClient().rpc("confirm_payment", {
    p_payment: p.id,
    p_provider_payment_id: `test_${p.id}`,
    p_amount: p.amount,
    p_currency: p.currency,
  });
  if (confirmError) redirect(`${detailUrl}?payment_error=${encodeURIComponent(friendlyError(confirmError))}`);
  revalidatePath("/", "layout");
  if (outcome === "confirmed" || outcome === "upgraded") redirect(`${detailUrl}?payment=test`);
  redirect(`${detailUrl}?payment_error=${encodeURIComponent("This booking could not be completed. Any recorded amount has been refunded.")}`);
}

export async function cancelAppointmentAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ appointment_id: z.string().uuid(), reason: z.string().trim().min(3, "Please give a reason").max(1000) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Please give a reason for cancelling.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_appointment", { p_appointment: parsed.data.appointment_id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: friendlyError(error) };
  after(() => processPendingRefunds().catch(() => undefined));
  revalidatePath("/", "layout");
  const refund = data as { refund_amount: number; refund_percent: number };
  return { ok: true, message: refund.refund_amount > 0 ? `Cancelled. A ${refund.refund_percent}% refund has been initiated.` : "Appointment cancelled." };
}

export async function requestRescheduleAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      appointment_id: z.string().uuid(),
      start: z.string().datetime({ offset: true, message: "Choose a new time" }),
      reason: z.string().trim().max(1000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a new time.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_reschedule", {
    p_appointment: parsed.data.appointment_id,
    p_new_start: parsed.data.start,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/patient/appointments/${parsed.data.appointment_id}`);
  return { ok: true, message: "Request sent. Your current appointment stays booked until it's approved." };
}

export async function withdrawRescheduleAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("request_id"));
  const supabase = await createClient();
  await supabase.rpc("withdraw_change_request", { p_request: id });
  revalidatePath("/patient", "layout");
}
