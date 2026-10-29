import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/layout/site-chrome";
import { ButtonLink, PageSkeleton } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/form-client";
import { getViewer } from "@/lib/auth/viewer";
import { getAppointment } from "@/features/appointments/queries";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { ConsultRoom } from "@/features/consultation/components/consult-room";
import { completeConsultationAction } from "@/features/doctor/actions";
import { MODE_LABELS } from "@/lib/domain";
import { formatDateTime } from "@/lib/time/format";

export const metadata: Metadata = { title: "Consultation", robots: { index: false } };

async function Room({ params }: { params: PageProps<"/consult/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/consult/${id}`);
  if (viewer.role !== "patient" && viewer.role !== "doctor") notFound();
  // RLS returns the appointment only to its participants (or admins, who are excluded above).
  const appt = await getAppointment(id);
  if (!appt || ![appt.patient_id, appt.doctor_id].includes(viewer.id)) notFound();
  const isDoctor = viewer.role === "doctor";
  const back = isDoctor ? `/doctor/appointments/${id}` : `/patient/appointments/${id}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {isDoctor ? appt.patient_name ?? "Patient" : appt.doctor ? `${appt.doctor.title} ${appt.doctor.display_name}` : "Consultation"} · {MODE_LABELS[appt.mode]}
          </h1>
          <p className="text-sm text-slate-500">{formatDateTime(appt.start_at, viewer.timezone)} · Ref {appt.reference}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={appt.status} />
          {isDoctor && (
            <>
              <ButtonLink href={`/doctor/appointments/${id}`} target="_blank" variant="secondary" size="sm">Patient record</ButtonLink>
              {(appt.status === "in_progress" || appt.status === "completed") && <ButtonLink href={`/doctor/appointments/${id}/prescription`} target="_blank" variant="secondary" size="sm">Prescription</ButtonLink>}
              {appt.status === "in_progress" && (
                <form action={completeConsultationAction}>
                  <input type="hidden" name="appointment_id" value={id} />
                  <ConfirmSubmit message="End and mark this consultation as completed?" variant="accent" size="sm">Complete consultation</ConfirmSubmit>
                </form>
              )}
            </>
          )}
          <Link href={back} className="text-sm text-brand-700 hover:underline">Back</Link>
        </div>
      </div>
      <ConsultRoom appointmentId={id} selfId={viewer.id} role={viewer.role} mode={appt.mode} timezone={viewer.timezone} />
      <p className="mt-4 text-xs text-slate-500">
        If you feel very unwell or this becomes an emergency, stop and call 911 (US), 999 (UK) or 112 (India).
      </p>
    </>
  );
}

export default function ConsultPage({ params }: PageProps<"/consult/[id]">) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6"><Logo /></header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Suspense fallback={<PageSkeleton />}>
          <Room params={params} />
        </Suspense>
      </main>
    </div>
  );
}
