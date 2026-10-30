import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { decideChangeRequestAction } from "@/features/admin/actions";
import { formatDateTime } from "@/lib/time/format";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

export default async function ChangeRequestsPage() {
  await requirePermission("appointments.manage");
  const supabase = await createClient();
  const [settings, { data }] = await Promise.all([
    getPlatformSettings(),
    supabase
      .from("appointment_change_requests")
      .select("id, proposed_start_at, reason, created_at, appointments(id, reference, start_at, mode, doctor_timezone, patient_timezone, doctor_profiles(title, display_name), patient_profiles(profiles(full_name)))")
      .eq("status", "pending")
      .order("created_at"),
  ]);
  const tz = settings.display.admin_timezone;
  return (
    <>
      <PageHeader title="Reschedule requests" description="Approving re-checks the new slot at that moment; if it was taken meanwhile, nothing changes." />
      {!data?.length ? (
        <Card><EmptyState icon={<ClipboardList className="size-6" aria-hidden />} title="No pending requests" /></Card>
      ) : (
        <div className="space-y-4">
          {data.map((r) => {
            const a = r.appointments as unknown as {
              id: string; reference: string; start_at: string; mode: ConsultationMode; doctor_timezone: string; patient_timezone: string;
              doctor_profiles: { title: string; display_name: string } | null; patient_profiles: { profiles: { full_name: string } | null } | null;
            };
            return (
              <Card key={r.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="text-sm">
                  <p className="font-medium text-slate-900"><Link href={`/admin/appointments/${a.id}`} className="hover:underline">{a.reference}</Link> · {a.patient_profiles?.profiles?.full_name ?? "Patient"} with {a.doctor_profiles ? `${a.doctor_profiles.title} ${a.doctor_profiles.display_name}` : "doctor"} · {MODE_LABELS[a.mode]}</p>
                  <p className="mt-2"><span className="text-slate-500">Current:</span> {formatDateTime(a.start_at, tz)}</p>
                  <p><span className="text-slate-500">Requested:</span> <strong>{formatDateTime(r.proposed_start_at, tz)}</strong></p>
                  <p className="text-xs text-slate-500">Doctor: {formatDateTime(r.proposed_start_at, a.doctor_timezone)} · Patient: {formatDateTime(r.proposed_start_at, a.patient_timezone)}</p>
                  {r.reason && <p className="mt-2 text-slate-700">&ldquo;{r.reason}&rdquo;</p>}
                </div>
                <ActionForm action={decideChangeRequestAction} submitLabel="Submit decision" hideOnSuccess>
                  <input type="hidden" name="request_id" value={r.id} />
                  <Field label="Decision" htmlFor={`d-${r.id}`}><Select id={`d-${r.id}`} name="decision"><option value="approve">Approve</option><option value="reject">Reject</option></Select></Field>
                  <Field label="Note (optional)" htmlFor={`n-${r.id}`}><Input id={`n-${r.id}`} name="note" /></Field>
                </ActionForm>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
