import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getAppointment } from "@/features/appointments/queries";
import { PRESCRIPTION_SELECT, PrescriptionDocument, type PrescriptionView } from "@/features/prescriptions/components/prescription-document";
import { PrescriptionEditor } from "@/features/prescriptions/components/prescription-editor";
import { PrintButton } from "@/features/prescriptions/components/print-button";
import { amendPrescriptionAction } from "@/features/doctor/actions";

export default async function PrescriptionPage({ params }: PageProps<"/doctor/appointments/[id]/prescription">) {
  const { id } = await params;
  const viewer = await requireApprovedDoctor();
  const appt = await getAppointment(id);
  if (!appt || appt.doctor_id !== viewer.id) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("prescriptions").select(PRESCRIPTION_SELECT).eq("appointment_id", id).order("version", { ascending: false });
  const versions = (data ?? []) as unknown as PrescriptionView[];
  const draft = versions.find((v) => v.status === "draft");
  const final = versions.find((v) => v.status === "final");

  return (
    <>
      <PageHeader
        title="Prescription & clinical notes"
        description={<><Link href={`/doctor/appointments/${id}`} className="text-brand-700 hover:underline">← {appt.patient_name ?? "Appointment"}</Link> · Ref {appt.reference}</>}
      />
      <div className="space-y-6">
        {draft && (
          <Card>
            <CardHeader title={draft.version > 1 ? `Amendment draft (v${draft.version})` : "Draft"} description="Only you can see drafts. The patient is notified when you finalise." />
            <div className="p-5"><PrescriptionEditor rx={draft} /></div>
          </Card>
        )}
        {!draft && !final && (
          <Card className="p-5 text-sm text-slate-600">
            No prescription yet. Open the appointment and choose &ldquo;Write prescription&rdquo;.
          </Card>
        )}
        {final && (
          <Card>
            <CardHeader title={`Final version (v${final.version})`} action={<div className="no-print"><PrintButton /></div>} />
            <PrescriptionDocument rx={final} timezone={viewer.timezone} />
            {!draft && (
              <div className="border-t border-slate-100 p-5 no-print">
                <p className="mb-2 text-sm font-medium text-slate-900">Need to correct something?</p>
                <ActionForm action={amendPrescriptionAction} submitLabel="Create amendment" variant="secondary">
                  <input type="hidden" name="prescription_id" value={final.id} />
                  <Field label="Reason for amendment" htmlFor="reason"><Input id="reason" name="reason" required /></Field>
                </ActionForm>
              </div>
            )}
          </Card>
        )}
        {versions.filter((v) => v.status === "superseded").map((v) => (
          <details key={v.id} className="rounded-[--radius-card] border border-slate-200 bg-white">
            <summary className="cursor-pointer px-5 py-3 text-sm text-slate-600">Superseded version v{v.version}</summary>
            <PrescriptionDocument rx={v} timezone={viewer.timezone} />
          </details>
        ))}
      </div>
    </>
  );
}
