import Link from "next/link";
import { Pill } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { formatDateTime } from "@/lib/time/format";
import { MODE_LABELS } from "@/lib/domain";

/** Longitudinal history: every completed consultation with its current prescription. */
export default async function PrescriptionsPage() {
  const viewer = await requireRole("patient", "/patient/prescriptions");
  const supabase = await createClient();
  const [{ data: prescriptions }, past] = await Promise.all([
    supabase.from("prescriptions").select("id, appointment_id, version, diagnosis, follow_up, finalized_at, doctor_snapshot").eq("status", "final").order("finalized_at", { ascending: false }),
    listAppointments({ scope: "past", limit: 100 }),
  ]);
  const byAppointment = new Map((prescriptions ?? []).map((p) => [p.appointment_id, p]));
  const consultations = past.filter((a) => a.status === "completed" || byAppointment.has(a.id));

  return (
    <>
      <PageHeader title="Prescriptions & medical history" description="Your consultations, diagnoses, prescriptions and follow-up advice in one place." />
      <Card>
        <CardHeader title="Consultation history" />
        {consultations.length === 0 ? (
          <EmptyState icon={<Pill className="size-6" aria-hidden />} title="No completed consultations yet" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {consultations.map((a) => {
              const rx = byAppointment.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-900">{formatDateTime(a.start_at, viewer.timezone, { withZone: false })}</p>
                    <p className="text-sm text-slate-600">{a.doctor ? `${a.doctor.title} ${a.doctor.display_name}` : ""} · {a.specialty ?? MODE_LABELS[a.mode]}</p>
                    {rx?.diagnosis && <p className="mt-1 text-sm text-slate-800"><span className="text-slate-500">Assessment:</span> {rx.diagnosis}</p>}
                    {rx?.follow_up && <p className="text-sm text-slate-800"><span className="text-slate-500">Follow-up:</span> {rx.follow_up}</p>}
                  </div>
                  {rx ? (
                    <Link href={`/patient/prescriptions/${rx.id}`} className="text-sm font-medium text-brand-700 hover:underline">View prescription</Link>
                  ) : (
                    <span className="text-sm text-slate-400">No prescription issued</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
