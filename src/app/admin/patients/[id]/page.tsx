import { notFound } from "next/navigation";
import { Alert, Card, CardHeader, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/ui/form-client";
import { hasPermission, requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { referralGrantAction, setUserActiveAction } from "@/features/admin/actions";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import { getPlatformSettings } from "@/features/appointments/settings";
import { MedicalProfileSummary } from "@/features/medical-profile/components/profile-summary";
import { formatDateTime } from "@/lib/time/format";

export default async function AdminPatientPage({ params, searchParams }: PageProps<"/admin/patients/[id]">) {
  const { id } = await params;
  const viewer = await requirePermission("patients.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const showClinical = (await searchParams).clinical === "1" && hasPermission(viewer, "clinical.read");
  const supabase = await createClient();
  const [{ data: profile }, settings, appts, { data: audit }, { data: doctors }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, country, timezone, is_active, created_at").eq("id", id).eq("role", "patient").maybeSingle(),
    getPlatformSettings(),
    listAppointments({ patientId: id, scope: "all", limit: 50 }),
    hasPermission(viewer, "audit.read") ? supabase.from("audit_logs").select("id, action, actor_role, created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: null }),
    supabase.from("doctor_profiles").select("user_id, title, display_name").eq("application_status", "approved").order("display_name"),
  ]);
  if (!profile) notFound();
  const tz = settings.display.admin_timezone;

  let medical: { data: unknown; completed_sections: string[] } | null = null;
  if (showClinical) {
    const { data } = await supabase.from("patient_medical_profiles").select("data, completed_sections").eq("patient_id", id).maybeSingle();
    medical = data;
    await createAdminClient().rpc("audit_as", { p_actor: viewer.id, p_action: "patient_record.view.admin", p_entity_type: "patient", p_entity_id: id, p_metadata: {} });
  }

  return (
    <>
      <PageHeader title={profile.full_name || profile.email} description={`${profile.email} · ${profile.phone ?? "no phone"} · ${profile.timezone}`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Appointments" />
            <AppointmentTable rows={appts} perspective="admin" timezone={tz} hrefBase="/admin/appointments" />
          </Card>
          {hasPermission(viewer, "clinical.read") && (
            <Card>
              <CardHeader title="Clinical record" description="Access is logged with your name." />
              <div className="p-5">
                {showClinical ? (
                  <MedicalProfileSummary data={(medical?.data as Record<string, Record<string, unknown>>) ?? {}} completed={medical?.completed_sections ?? []} />
                ) : (
                  <a href="?clinical=1" className="text-sm font-medium text-brand-700 hover:underline">Open clinical record (audited)</a>
                )}
              </div>
            </Card>
          )}
          {audit && (
            <Card>
              <CardHeader title="Audit events for this patient" />
              <Table>
                <tbody>{audit.map((a) => <tr key={a.id}><td className="w-56">{formatDateTime(a.created_at, tz, { withZone: false })}</td><td>{a.action}</td><td>{a.actor_role}</td></tr>)}</tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="font-medium text-slate-900">Account</p>
            <p className="text-sm text-slate-600">Joined {formatDateTime(profile.created_at, tz, { withZone: false })}</p>
            {!profile.is_active && <Alert tone="warning" className="mt-2">Account deactivated.</Alert>}
            <form action={setUserActiveAction} className="mt-3">
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="role" value="patient" />
              <input type="hidden" name="active" value={profile.is_active ? "false" : "true"} />
              <ConfirmSubmit message={profile.is_active ? "Restrict this account?" : "Reactivate this account?"} variant={profile.is_active ? "danger" : "secondary"} size="sm">
                {profile.is_active ? "Restrict access" : "Reactivate"}
              </ConfirmSubmit>
            </form>
          </Card>
          {hasPermission(viewer, "clinical.read") && (
            <Card className="p-5">
              <p className="mb-2 font-medium text-slate-900">Clinical referral</p>
              <p className="mb-3 text-sm text-slate-600">Give another doctor time-limited access to this patient&apos;s history. The patient is notified and can revoke it.</p>
              <ActionForm action={referralGrantAction} submitLabel="Grant access" variant="secondary">
                <input type="hidden" name="patient_id" value={id} />
                <Field label="Doctor" htmlFor="doctor_id"><Select id="doctor_id" name="doctor_id" required>{doctors?.map((d) => <option key={d.user_id} value={d.user_id}>{d.title} {d.display_name}</option>)}</Select></Field>
                <Field label="Days" htmlFor="days"><Input id="days" name="days" type="number" min={1} max={365} defaultValue={30} /></Field>
                <Field label="Clinical reason" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} required /></Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
