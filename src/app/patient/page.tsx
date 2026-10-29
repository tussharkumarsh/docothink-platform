import Link from "next/link";
import { CalendarPlus, CalendarDays } from "lucide-react";
import { Alert, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { completion } from "@/features/medical-profile/schema";
import { formatDateTime } from "@/lib/time/format";
import { MODE_LABELS } from "@/lib/domain";

export default async function PatientDashboard() {
  const viewer = await requireRole("patient", "/patient");
  const supabase = await createClient();
  const [upcoming, { data: med }, { data: patient }, { count: rxCount }] = await Promise.all([
    listAppointments({ scope: "upcoming", limit: 5 }),
    supabase.from("patient_medical_profiles").select("completed_sections").eq("patient_id", viewer.id).single(),
    supabase.from("patient_profiles").select("sex").eq("user_id", viewer.id).single(),
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "final"),
  ]);
  const progress = completion(med?.completed_sections ?? [], patient?.sex ?? null);

  return (
    <>
      <PageHeader
        title={`Hello${viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}`}
        description={`Times are shown in ${viewer.timezone}.`}
        actions={<ButtonLink href="/doctors"><CalendarPlus className="size-4" aria-hidden /> Book a consultation</ButtonLink>}
      />
      {viewer.timezone === "UTC" && (
        <Alert tone="info" className="mb-6">Your time zone is set to UTC. <Link href="/patient/profile" className="underline">Set your local time zone</Link> so appointment times are shown correctly.</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming appointments" value={upcoming.length} />
        <Stat label="Medical profile" value={`${progress.percent}%`} hint={<Link href="/patient/medical-profile" className="text-brand-700 hover:underline">{progress.percent < 100 ? "Continue profile" : "Review profile"}</Link>} />
        <Stat label="Prescriptions" value={rxCount ?? 0} hint={<Link href="/patient/prescriptions" className="text-brand-700 hover:underline">View history</Link>} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Upcoming appointments" action={<Link href="/patient/appointments" className="text-sm text-brand-700 hover:underline">View all</Link>} />
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="No upcoming appointments" description="Find a doctor and book a time that works for you." action={<ButtonLink href="/doctors" size="sm">Find a doctor</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link href={`/patient/appointments/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-900">{a.doctor ? `${a.doctor.title} ${a.doctor.display_name}` : "Doctor"}</p>
                    <p className="text-sm text-slate-600">{formatDateTime(a.start_at, viewer.timezone)} · {MODE_LABELS[a.mode]}</p>
                  </div>
                  <StatusBadge status={a.status} changeRequested={!!a.pending_change} rescheduled={a.reschedule_count > 0} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
