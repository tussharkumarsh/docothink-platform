import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, Field, PageHeader, Textarea } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/ui/form-client";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppointment, getIntake } from "@/features/appointments/queries";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { getPlatformSettings, joinWindow } from "@/features/appointments/settings";
import { MedicalProfileSummary } from "@/features/medical-profile/components/profile-summary";
import { completeConsultationAction, openPrescriptionAction } from "@/features/doctor/actions";
import { cancelAppointmentAction } from "@/features/booking/actions";
import { MODE_LABELS } from "@/lib/domain";
import { formatMoney, splitCommission } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time/format";

export default async function DoctorAppointmentPage({ params, searchParams }: PageProps<"/doctor/appointments/[id]">) {
  const { id } = await params;
  const viewer = await requireApprovedDoctor();
  const appt = await getAppointment(id);
  if (!appt || appt.doctor_id !== viewer.id) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const hasAccess = ["confirmed", "in_progress", "completed", "no_show"].includes(appt.status);

  const [settings, intake, profile, patient, docs, history] = await Promise.all([
    getPlatformSettings(),
    getIntake(id),
    hasAccess ? supabase.from("patient_medical_profiles").select("data, completed_sections").eq("patient_id", appt.patient_id).maybeSingle() : Promise.resolve({ data: null }),
    hasAccess ? supabase.from("patient_profiles").select("date_of_birth, sex, country").eq("user_id", appt.patient_id).maybeSingle() : Promise.resolve({ data: null }),
    hasAccess ? supabase.from("medical_documents").select("id, title, category, created_at").eq("patient_id", appt.patient_id).eq("status", "available").order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    hasAccess ? supabase.from("prescriptions").select("id, appointment_id, diagnosis, finalized_at, doctor_snapshot").eq("patient_id", appt.patient_id).eq("status", "final").order("finalized_at", { ascending: false }) : Promise.resolve({ data: null }),
  ]);
  const { data: rx } = await supabase.from("prescriptions").select("id, status, version").eq("appointment_id", id).order("version", { ascending: false });

  if (hasAccess) {
    // Viewing a patient's clinical record is an audited event.
    await createAdminClient().rpc("audit_as", { p_actor: viewer.id, p_action: "patient_record.view", p_entity_type: "patient", p_entity_id: appt.patient_id, p_metadata: { appointment_id: id } });
  }
  const window = joinWindow(appt.start_at, appt.end_at, settings.consultation);
  const { net } = splitCommission(appt.amount_paid, appt.commission_bps);

  return (
    <>
      <PageHeader
        title={appt.patient_name ?? "Patient"}
        description={<>Ref {appt.reference} · {MODE_LABELS[appt.mode]} · {formatDateTime(appt.start_at, viewer.timezone)}</>}
        actions={<StatusBadge status={appt.status} changeRequested={!!appt.pending_change} rescheduled={appt.reschedule_count > 0} />}
      />
      {typeof sp.error === "string" && <Alert tone="danger" className="mb-4">{sp.error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Reason for visit" />
            <div className="p-5 text-sm">
              <p className="whitespace-pre-line text-slate-800">{intake?.reason_for_visit ?? "—"}</p>
              {intake?.symptoms_duration && <p className="mt-2 text-slate-600">Duration: {intake.symptoms_duration}</p>}
            </div>
          </Card>
          {hasAccess ? (
            <>
              <Card>
                <CardHeader title="Medical profile" description={patient.data ? `DOB ${patient.data.date_of_birth ? formatDate(patient.data.date_of_birth) : "—"} · ${patient.data.sex?.replaceAll("_", " ") ?? "sex not given"} · ${patient.data.country ?? ""}` : undefined} />
                <div className="p-5">
                  <MedicalProfileSummary data={(profile.data?.data as Record<string, Record<string, unknown>>) ?? {}} completed={profile.data?.completed_sections ?? []} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Reports" />
                {docs.data?.length ? (
                  <ul className="divide-y divide-slate-100">
                    {docs.data.map((d) => (
                      <li key={d.id} className="flex justify-between px-5 py-3 text-sm">
                        <span>{d.title} <Badge className="ml-1">{d.category.replace("_", " ")}</Badge></span>
                        <a href={`/api/files/documents/${d.id}`} className="font-medium text-brand-700 hover:underline">Open</a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="p-5 text-sm text-slate-500">No reports uploaded.</p>}
              </Card>
              <Card>
                <CardHeader title="Previous consultations" description="Finalised records you're authorised to see." />
                {history.data?.filter((h) => h.appointment_id !== id).length ? (
                  <ul className="divide-y divide-slate-100">
                    {history.data.filter((h) => h.appointment_id !== id).map((h) => (
                      <li key={h.id} className="px-5 py-3 text-sm">
                        <p className="font-medium text-slate-900">{h.finalized_at ? formatDate(h.finalized_at, viewer.timezone) : ""} · {(h.doctor_snapshot as { name?: string } | null)?.name}</p>
                        <p className="text-slate-700">{h.diagnosis}</p>
                        <Link href={`/doctor/prescriptions/${h.id}`} className="text-brand-700 hover:underline">View record</Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="p-5 text-sm text-slate-500">No earlier records.</p>}
              </Card>
            </>
          ) : (
            <Alert tone="info">The patient&apos;s records become available once the booking is confirmed (paid).</Alert>
          )}
        </div>

        <div className="space-y-4">
          {(appt.status === "confirmed" || appt.status === "in_progress") && (
            <Card className="space-y-3 p-5">
              <p className="font-medium text-slate-900">Consultation</p>
              {window.open ? (
                <ButtonLink href={`/consult/${appt.id}`} className="w-full"><Video className="size-4" aria-hidden /> {appt.status === "in_progress" ? "Rejoin" : "Start consultation"}</ButtonLink>
              ) : (
                <p className="text-sm text-slate-600">The room opens {settings.consultation.join_open_minutes_before} minutes before the start time.</p>
              )}
              {appt.status === "in_progress" && (
                <form action={completeConsultationAction}>
                  <input type="hidden" name="appointment_id" value={appt.id} />
                  <ConfirmSubmit message="Mark this consultation as completed?" variant="accent" className="w-full">Complete consultation</ConfirmSubmit>
                </form>
              )}
            </Card>
          )}

          {(appt.status === "in_progress" || appt.status === "completed") && (
            <Card className="space-y-3 p-5">
              <p className="font-medium text-slate-900">Prescription & notes</p>
              {rx?.map((r) => (
                <p key={r.id} className="text-sm">v{r.version} <Badge tone={r.status === "final" ? "success" : r.status === "draft" ? "warning" : "neutral"}>{r.status}</Badge></p>
              ))}
              <form action={openPrescriptionAction}>
                <input type="hidden" name="appointment_id" value={appt.id} />
                <Button type="submit" variant="secondary" className="w-full">{rx?.length ? "Open prescription" : "Write prescription"}</Button>
              </form>
            </Card>
          )}

          <Card className="p-5 text-sm">
            <p className="font-medium text-slate-900">Times</p>
            <p className="mt-1">You: {formatDateTime(appt.start_at, viewer.timezone)}</p>
            <p className="text-slate-600">Patient: {formatDateTime(appt.start_at, appt.patient_timezone)}</p>
            <p className="mt-3 font-medium text-slate-900">Earnings</p>
            <p className="text-slate-600">Paid {formatMoney(appt.amount_paid, appt.currency)} · your share {formatMoney(net, appt.currency)} after {appt.commission_bps / 100}% commission</p>
          </Card>

          {appt.status === "confirmed" && (
            <Card className="p-5">
              <p className="font-medium text-slate-900">Cancel</p>
              <p className="mt-1 text-sm text-slate-600">The patient is refunded in full and notified.</p>
              <div className="mt-3">
                <ActionForm action={cancelAppointmentAction} submitLabel="Cancel appointment" variant="danger" confirm="Cancel and fully refund this appointment?" hideOnSuccess>
                  <input type="hidden" name="appointment_id" value={appt.id} />
                  <Field label="Reason (shared with patient)" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} required /></Field>
                </ActionForm>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
