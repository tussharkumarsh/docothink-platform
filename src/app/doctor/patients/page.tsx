import { nowMs } from "@/lib/time/now";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { formatDate } from "@/lib/time/format";

/** Patients this doctor has a treating relationship with, or who shared records with them. */
export default async function DoctorPatientsPage() {
  const viewer = await requireApprovedDoctor();
  const supabase = await createClient();
  const [appts, { data: grants }] = await Promise.all([
    listAppointments({ scope: "all", limit: 500 }),
    supabase.from("clinical_access_grants").select("patient_id, reason, expires_at, revoked_at, patient_profiles(profiles(full_name))").eq("doctor_id", viewer.id).is("revoked_at", null),
  ]);
  const patients = new Map<string, { name: string; last: string; count: number; lastId: string; shared?: string }>();
  for (const a of appts.filter((a) => ["confirmed", "in_progress", "completed", "no_show"].includes(a.status))) {
    const p = patients.get(a.patient_id);
    if (!p) patients.set(a.patient_id, { name: a.patient_name ?? "Patient", last: a.start_at, count: 1, lastId: a.id });
    else {
      p.count++;
      if (a.start_at > p.last) Object.assign(p, { last: a.start_at, lastId: a.id });
    }
  }
  const shared = (grants ?? []).filter((g) => !g.expires_at || Date.parse(g.expires_at) > nowMs());
  return (
    <>
      <PageHeader title="Patients" description="Only patients you are treating, or who have shared their records with you, appear here." />
      <Card className="mb-6">
        {patients.size === 0 ? <EmptyState icon={<Users className="size-6" aria-hidden />} title="No patients yet" /> : (
          <Table>
            <thead><tr><th>Patient</th><th>Consultations</th><th>Most recent</th><th /></tr></thead>
            <tbody>
              {[...patients].sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([id, p]) => (
                <tr key={id}>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td>{p.count}</td>
                  <td>{formatDate(p.last, viewer.timezone)}</td>
                  <td className="text-right"><Link href={`/doctor/appointments/${p.lastId}`} className="text-sm text-brand-700 hover:underline">Open record</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {shared.length > 0 && (
        <Card>
          <Table>
            <thead><tr><th>Shared with you</th><th>Reason</th><th>Until</th></tr></thead>
            <tbody>
              {shared.map((g) => (
                <tr key={g.patient_id}>
                  <td>{(g.patient_profiles as unknown as { profiles: { full_name: string } | null } | null)?.profiles?.full_name ?? "Patient"}</td>
                  <td>{g.reason}</td>
                  <td>{g.expires_at ? formatDate(g.expires_at, viewer.timezone) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
