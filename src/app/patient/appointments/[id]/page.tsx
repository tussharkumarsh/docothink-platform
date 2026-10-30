import { nowMs } from "@/lib/time/now";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getAppointment, getAppointmentEvents, getIntake } from "@/features/appointments/queries";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { getPlatformSettings, joinWindow } from "@/features/appointments/settings";
import { getDoctorBySlug, getDoctorSlots } from "@/features/catalog/queries";
import {
  cancelAppointmentAction,
  payAppointmentAction,
  requestRescheduleAction,
  upgradeAppointmentAction,
  withdrawRescheduleAction,
} from "@/features/booking/actions";
import { paymentsConfigured, testPaymentsEnabled } from "@/lib/payments";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";
import { formatMoney, patientRefundPercent } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";

const PAYMENT_MESSAGES: Record<string, { tone: "info" | "success" | "warning"; text: string }> = {
  processing: { tone: "info", text: "Thanks! We're confirming your payment with the provider. This page updates once it's confirmed." },
  cancelled: { tone: "warning", text: "Payment was cancelled. Your slot is still held until the reservation expires." },
  unconfigured: { tone: "warning", text: "Online payment isn't configured for this deployment yet, so this booking can't be paid online." },
  test: { tone: "success", text: "Booking confirmed. The fee was recorded as paid in test mode; no card was charged." },
};

export default async function PatientAppointmentPage({ params, searchParams }: PageProps<"/patient/appointments/[id]">) {
  const { id } = await params;
  const viewer = await requireRole("patient", `/patient/appointments/${id}`);
  const appt = await getAppointment(id);
  if (!appt || appt.patient_id !== viewer.id) notFound();
  const sp = await searchParams;
  const tz = viewer.timezone !== "UTC" ? viewer.timezone : appt.patient_timezone;

  const supabase = await createClient();
  const [settings, intake, events, { data: prescriptions }, { data: payments }, { data: review }] = await Promise.all([
    getPlatformSettings(),
    getIntake(id),
    getAppointmentEvents(id),
    supabase.from("prescriptions").select("id, version, status, finalized_at").eq("appointment_id", id).order("version", { ascending: false }),
    supabase.from("payment_records").select("id, purpose, amount, currency, status, created_at").eq("appointment_id", id).order("created_at"),
    supabase.from("doctor_reviews").select("rating, comment, comment_status").eq("appointment_id", id).maybeSingle(),
  ]);
  const canReview = appt.status === "completed" && !review && Date.parse(appt.end_at) > nowMs() - 30 * 86_400_000;

  const window = joinWindow(appt.start_at, appt.end_at, settings.consultation);
  const upcoming = appt.status === "confirmed" && Date.parse(appt.start_at) > nowMs();
  const hoursBefore = (Date.parse(appt.start_at) - nowMs()) / 3_600_000;
  const refundPct = appt.status === "confirmed" ? patientRefundPercent(hoursBefore, settings.cancellation) : 0;
  const upgrades = (Object.entries(appt.fee_snapshot) as [ConsultationMode, number][]).filter(([, fee]) => fee > appt.fee_amount);

  let rescheduleSlots: { start: string }[] = [];
  if (upcoming && !appt.pending_change && appt.doctor) {
    const doctor = await getDoctorBySlug(appt.doctor.slug);
    if (doctor) rescheduleSlots = (await getDoctorSlots(doctor, appt.mode)).filter((s) => s.start !== appt.start_at).slice(0, 80);
  }
  const paymentNote = typeof sp.payment === "string" ? PAYMENT_MESSAGES[sp.payment] : undefined;

  return (
    <>
      <PageHeader
        title={appt.doctor ? `${appt.doctor.title} ${appt.doctor.display_name}` : "Appointment"}
        description={<>Reference {appt.reference}</>}
        actions={<StatusBadge status={appt.status} changeRequested={!!appt.pending_change} rescheduled={appt.reschedule_count > 0} />}
      />
      <div className="space-y-4">
        {paymentNote && <Alert tone={paymentNote.tone}>{paymentNote.text}</Alert>}
        {typeof sp.payment_error === "string" && <Alert tone="danger">{sp.payment_error}</Alert>}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Appointment" />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Your time</dt><dd className="font-medium text-slate-900">{formatDateTime(appt.start_at, tz)}</dd></div>
              <div><dt className="text-slate-500">Doctor&apos;s time</dt><dd className="text-slate-700">{formatDateTime(appt.start_at, appt.doctor_timezone)}</dd></div>
              <div><dt className="text-slate-500">Consultation</dt><dd className="text-slate-900">{MODE_LABELS[appt.mode]} · {Math.round((Date.parse(appt.end_at) - Date.parse(appt.start_at)) / 60000)} min</dd></div>
              <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900">{formatMoney(appt.fee_amount, appt.currency)}{appt.amount_paid > 0 && <span className="text-slate-500"> · paid {formatMoney(appt.amount_paid, appt.currency)}</span>}</dd></div>
              {intake && <div className="sm:col-span-2"><dt className="text-slate-500">Reason for visit</dt><dd className="whitespace-pre-line text-slate-800">{intake.reason_for_visit}</dd></div>}
              {appt.cancellation_reason && <div className="sm:col-span-2"><dt className="text-slate-500">Cancellation reason</dt><dd className="text-slate-800">{appt.cancellation_reason}</dd></div>}
            </dl>
          </Card>

          {appt.status === "pending_payment" && (
            <Card>
              <CardHeader title="Complete payment" description={appt.payment_expires_at ? `Your slot is held until ${formatDateTime(appt.payment_expires_at, tz)}.` : undefined} />
              <div className="flex flex-wrap gap-3 p-5">
                {paymentsConfigured() || testPaymentsEnabled() ? (
                  <form action={payAppointmentAction}>
                    <input type="hidden" name="appointment_id" value={appt.id} />
                    <Button type="submit">
                      {testPaymentsEnabled() ? "Confirm booking" : "Pay"} {formatMoney(appt.fee_amount - appt.amount_paid, appt.currency)}
                    </Button>
                  </form>
                ) : (
                  <Alert tone="warning">Online payment is not configured, so this booking cannot be confirmed yet.</Alert>
                )}
              </div>
            </Card>
          )}

          {appt.pending_change && (
            <Alert tone="warning" title="Reschedule requested">
              You asked to move to {formatDateTime(appt.pending_change.proposed_start_at, tz)}. Your current time stays booked until an administrator approves it.
              <form action={withdrawRescheduleAction} className="mt-2">
                <input type="hidden" name="request_id" value={appt.pending_change.id} />
                <Button type="submit" size="sm" variant="secondary">Withdraw request</Button>
              </form>
            </Alert>
          )}

          {upcoming && !appt.pending_change && (
            <Card>
              <CardHeader title="Request a different time" description={`Times in ${tz}. Your original slot stays reserved until the change is approved.`} />
              <div className="p-5">
                {rescheduleSlots.length === 0 ? (
                  <p className="text-sm text-slate-500">No other times are currently available for this doctor.</p>
                ) : (
                  <ActionForm action={requestRescheduleAction} submitLabel="Send reschedule request" hideOnSuccess>
                    <input type="hidden" name="appointment_id" value={appt.id} />
                    <Field label="New time" htmlFor="start">
                      <Select id="start" name="start" required>
                        {rescheduleSlots.map((s) => <option key={s.start} value={s.start}>{formatDateTime(s.start, tz, { withZone: false })}</option>)}
                      </Select>
                    </Field>
                    <Field label="Reason (optional)" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} /></Field>
                  </ActionForm>
                )}
              </div>
            </Card>
          )}

          {upcoming && upgrades.length > 0 && (
            <Card>
              <CardHeader title="Upgrade consultation type" description="Pay only the difference, at the prices that applied when you booked." />
              <div className="flex flex-wrap gap-3 p-5">
                {upgrades.map(([mode, fee]) => (
                  <form key={mode} action={paymentsConfigured() || testPaymentsEnabled() ? upgradeAppointmentAction : undefined}>
                    <input type="hidden" name="appointment_id" value={appt.id} />
                    <input type="hidden" name="mode" value={mode} />
                    <Button type="submit" variant="secondary" disabled={!paymentsConfigured() && !testPaymentsEnabled()}>
                      {MODE_LABELS[mode]} (+{formatMoney(fee - appt.fee_amount, appt.currency)})
                    </Button>
                  </form>
                ))}
              </div>
            </Card>
          )}

          {canReview && (
            <Card>
              <CardHeader title="Rate your consultation" description="Your rating helps other patients choose. It appears with your first name and last initial unless you post anonymously." />
              <div className="p-5">
                <ReviewForm appointmentId={appt.id} />
              </div>
            </Card>
          )}

          {review && (
            <Card>
              <CardHeader title="Your review" />
              <div className="space-y-2 p-5 text-sm">
                <p className="text-lg text-amber-400" aria-label={`${review.rating} out of 5 stars`}>
                  {"★".repeat(review.rating)}<span className="text-slate-300">{"★".repeat(5 - review.rating)}</span>
                </p>
                {review.comment && (
                  <>
                    <p className="text-slate-700">{review.comment}</p>
                    <Badge tone={review.comment_status === "approved" ? "success" : review.comment_status === "hidden" ? "neutral" : "warning"}>
                      {review.comment_status === "approved" ? "Published" : review.comment_status === "hidden" ? "Not published" : "Awaiting review"}
                    </Badge>
                  </>
                )}
              </div>
            </Card>
          )}

          {(prescriptions?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Prescriptions" />
              <ul className="divide-y divide-slate-100">
                {prescriptions!.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>Version {p.version} {p.status === "superseded" && <Badge>Superseded</Badge>}</span>
                    <Link href={`/patient/prescriptions/${p.id}`} className="font-medium text-brand-700 hover:underline">View</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="History" />
            <ol className="space-y-2 p-5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-44 shrink-0 text-slate-500">{formatDateTime(e.created_at, tz, { withZone: false })}</span>
                  <span className="text-slate-800">
                    {e.event === "status_changed" ? `Status: ${e.from_status} → ${e.to_status}` : e.event === "rescheduled" ? "Rescheduled" : e.event === "mode_changed" ? "Consultation type changed" : "Booked"}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          {(appt.status === "confirmed" || appt.status === "in_progress") && (
            <Card className="p-5">
              <p className="font-medium text-slate-900">Consultation room</p>
              {window.open ? (
                <ButtonLink href={`/consult/${appt.id}`} className="mt-3 w-full"><Video className="size-4" aria-hidden /> Join now</ButtonLink>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Opens {settings.consultation.join_open_minutes_before} minutes before the start time ({formatDateTime(new Date(window.opens).toISOString(), tz, { withZone: false })}).
                </p>
              )}
            </Card>
          )}

          {(appt.status === "confirmed" || appt.status === "pending_payment") && (
            <Card className="p-5">
              <p className="font-medium text-slate-900">Cancel appointment</p>
              <p className="mt-1 text-sm text-slate-600">
                {appt.status === "pending_payment" ? "Nothing has been charged." : `Cancelling now refunds ${refundPct}% (${formatMoney(Math.floor((appt.amount_paid * refundPct) / 100), appt.currency)}).`}
              </p>
              <div className="mt-3">
                <ActionForm action={cancelAppointmentAction} submitLabel="Cancel appointment" variant="danger" confirm="Cancel this appointment?" hideOnSuccess>
                  <input type="hidden" name="appointment_id" value={appt.id} />
                  <Field label="Reason" htmlFor="cancel-reason"><Textarea id="cancel-reason" name="reason" rows={2} required /></Field>
                </ActionForm>
              </div>
            </Card>
          )}

          {(payments?.length ?? 0) > 0 && (
            <Card className="p-5">
              <p className="font-medium text-slate-900">Payments</p>
              <ul className="mt-2 space-y-1 text-sm">
                {payments!.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="capitalize text-slate-600">{p.purpose} · {p.status.replace("_", " ")}</span>
                    <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/patient/payments" className="mt-2 inline-block text-sm text-brand-700 hover:underline">Receipts</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
