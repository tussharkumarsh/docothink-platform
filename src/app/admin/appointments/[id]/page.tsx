import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Table, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { hasPermission, requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getAppointment, getAppointmentEvents } from "@/features/appointments/queries";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { getPlatformSettings } from "@/features/appointments/settings";
import { adminCancelAction, adminRefundAction } from "@/features/admin/actions";
import { MODE_LABELS } from "@/lib/domain";
import { formatMoney, splitCommission, toMajorString } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";

export default async function AdminAppointmentPage({ params }: PageProps<"/admin/appointments/[id]">) {
  const { id } = await params;
  const viewer = await requirePermission("appointments.manage");
  const appt = await getAppointment(id);
  if (!appt) notFound();
  const supabase = await createClient();
  const [settings, events, { data: payments }, { data: refunds }, { data: consultation }] = await Promise.all([
    getPlatformSettings(),
    getAppointmentEvents(id),
    hasPermission(viewer, "finance.manage") ? supabase.from("payment_records").select("id, purpose, provider, amount, amount_refunded, currency, status, provider_payment_id, created_at").eq("appointment_id", id) : Promise.resolve({ data: null }),
    hasPermission(viewer, "finance.manage") ? supabase.from("refunds").select("id, amount, currency, status, reason, created_at").eq("appointment_id", id) : Promise.resolve({ data: null }),
    supabase.from("consultations").select("patient_joined_at, doctor_joined_at, started_at, ended_at, duration_seconds").eq("appointment_id", id).maybeSingle(),
  ]);
  const tz = settings.display.admin_timezone;
  const refunded = (refunds ?? []).filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0);
  const { commission, net } = splitCommission(appt.amount_paid, appt.commission_bps);

  return (
    <>
      <PageHeader title={`Appointment ${appt.reference}`} actions={<StatusBadge status={appt.status} changeRequested={!!appt.pending_change} rescheduled={appt.reschedule_count > 0} />} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Patient</dt><dd><Link href={`/admin/patients/${appt.patient_id}`} className="text-brand-700 hover:underline">{appt.patient_name ?? appt.patient_id}</Link></dd></div>
              <div><dt className="text-slate-500">Doctor</dt><dd><Link href={`/admin/doctors/${appt.doctor_id}`} className="text-brand-700 hover:underline">{appt.doctor ? `${appt.doctor.title} ${appt.doctor.display_name}` : "—"}</Link></dd></div>
              <div><dt className="text-slate-500">Time ({tz})</dt><dd className="font-medium">{formatDateTime(appt.start_at, tz)}</dd></div>
              <div><dt className="text-slate-500">Doctor&apos;s time</dt><dd>{formatDateTime(appt.start_at, appt.doctor_timezone)}</dd></div>
              <div><dt className="text-slate-500">Patient&apos;s time</dt><dd>{formatDateTime(appt.start_at, appt.patient_timezone)}</dd></div>
              <div><dt className="text-slate-500">Type</dt><dd>{MODE_LABELS[appt.mode]}</dd></div>
              <div><dt className="text-slate-500">Fee / paid</dt><dd>{formatMoney(appt.fee_amount, appt.currency)} / {formatMoney(appt.amount_paid, appt.currency)}</dd></div>
              <div><dt className="text-slate-500">Commission ({appt.commission_bps / 100}%)</dt><dd>{formatMoney(commission, appt.currency)} · doctor {formatMoney(net, appt.currency)}</dd></div>
              {consultation && <div className="sm:col-span-2"><dt className="text-slate-500">Session</dt><dd>Patient joined {consultation.patient_joined_at ? formatDateTime(consultation.patient_joined_at, tz, { withZone: false }) : "—"} · Doctor joined {consultation.doctor_joined_at ? formatDateTime(consultation.doctor_joined_at, tz, { withZone: false }) : "—"} · Duration {consultation.duration_seconds != null ? `${Math.round(consultation.duration_seconds / 60)} min` : "—"}</dd></div>}
              {appt.cancellation_reason && <div className="sm:col-span-2"><dt className="text-slate-500">Cancellation reason</dt><dd>{appt.cancellation_reason}</dd></div>}
            </dl>
          </Card>
          {payments && (
            <Card>
              <CardHeader title="Payments & refunds" />
              <Table>
                <thead><tr><th>Payment</th><th>Status</th><th>Provider ref</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {payments.map((p) => <tr key={p.id}><td className="capitalize">{p.purpose} {p.provider === "manual" && <Badge tone="warning">test</Badge>}</td><td>{p.status}</td><td className="font-mono text-xs">{p.provider_payment_id ?? "—"}</td><td className="text-right">{formatMoney(p.amount, p.currency)}</td></tr>)}
                  {refunds?.map((r) => <tr key={r.id}><td>Refund · {r.reason}</td><td>{r.status}</td><td /><td className="text-right text-red-700">−{formatMoney(r.amount, r.currency)}</td></tr>)}
                </tbody>
              </Table>
            </Card>
          )}
          <Card>
            <CardHeader title="History" />
            <Table>
              <tbody>{events.map((e) => <tr key={e.id}><td className="w-56">{formatDateTime(e.created_at, tz, { withZone: false })}</td><td>{e.event}{e.from_status ? `: ${e.from_status} → ${e.to_status}` : ""}</td></tr>)}</tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-4">
          {appt.pending_change && (
            <Card className="p-5 text-sm">
              <p className="font-medium text-slate-900">Pending reschedule</p>
              <p className="mt-1">To {formatDateTime(appt.pending_change.proposed_start_at, tz)}</p>
              <Link href="/admin/appointments/change-requests" className="mt-2 inline-block text-brand-700 hover:underline">Decide</Link>
            </Card>
          )}
          {["pending_payment", "confirmed", "in_progress"].includes(appt.status) && (
            <Card className="p-5">
              <p className="mb-2 font-medium text-slate-900">Cancel appointment</p>
              <ActionForm action={adminCancelAction} submitLabel="Cancel with full refund" variant="danger" confirm="Cancel this appointment and refund the patient in full?" hideOnSuccess>
                <input type="hidden" name="appointment_id" value={appt.id} />
                <Field label="Reason" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} required /></Field>
              </ActionForm>
            </Card>
          )}
          {hasPermission(viewer, "finance.manage") && ["completed", "cancelled", "no_show", "in_progress"].includes(appt.status) && appt.amount_paid - refunded > 0 && (
            <Card className="p-5">
              <p className="mb-2 font-medium text-slate-900">Issue refund</p>
              <p className="mb-2 text-sm text-slate-600">Refundable: {formatMoney(appt.amount_paid - refunded, appt.currency)}. If the doctor was already credited, their share is reversed in the ledger.</p>
              <ActionForm action={adminRefundAction} submitLabel="Refund" variant="secondary" confirm="Send this refund?">
                <input type="hidden" name="appointment_id" value={appt.id} />
                <input type="hidden" name="currency" value={appt.currency} />
                <Field label={`Amount (${appt.currency})`} htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" defaultValue={toMajorString(appt.amount_paid - refunded, appt.currency)} /></Field>
                <Field label="Reason" htmlFor="rreason"><Input id="rreason" name="reason" required /></Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
