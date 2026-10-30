import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/ui/form-client";
import { hasPermission, requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { reviewCredentialAction, reviewDoctorAction, setCommissionAction, setUserActiveAction } from "@/features/admin/actions";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import { getPlatformSettings } from "@/features/appointments/settings";
import { APPLICATION_STATUS_LABELS, MODE_LABELS, type DoctorApplicationStatus } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";
import { BankKycPanel, type MaskedBank } from "@/features/admin/components/bank-kyc-panel";

const ACTIONS: Record<string, [string, string][]> = {
  submitted: [["start_review", "Start review"], ["approve", "Approve"], ["request_info", "Request more information"], ["reject", "Reject"]],
  under_review: [["approve", "Approve"], ["request_info", "Request more information"], ["reject", "Reject"]],
  info_required: [["reject", "Reject"]],
  approved: [["suspend", "Suspend"]],
  suspended: [["reinstate", "Reinstate"]],
};

export default async function AdminDoctorPage({ params }: PageProps<"/admin/doctors/[id]">) {
  const { id } = await params;
  const viewer = await requirePermission("doctors.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: d }, { data: creds }, { data: events }, { data: specs }, { data: rules }, { data: commission }, settings, appts] = await Promise.all([
    supabase.from("doctor_profiles").select("*, profiles(email, phone, is_active)").eq("user_id", id).maybeSingle(),
    supabase.from("doctor_credentials").select("*").eq("doctor_id", id).order("created_at"),
    supabase.from("doctor_application_events").select("*").eq("doctor_id", id).order("created_at", { ascending: false }),
    supabase.from("doctor_specialties").select("is_primary, specialties(name)").eq("doctor_id", id),
    supabase.from("doctor_availability_rules").select("weekday, start_time, end_time, timezone, modes").eq("doctor_id", id).order("weekday"),
    supabase.from("commission_rules").select("rate_bps, doctor_id, effective_from").or(`doctor_id.eq.${id},doctor_id.is.null`).order("effective_from", { ascending: false }),
    getPlatformSettings(),
    listAppointments({ doctorId: id, scope: "all", limit: 20 }),
  ]);
  if (!d) notFound();
  const canFinance = hasPermission(viewer, "finance.manage");
  const { data: bank } = canFinance
    ? await supabase.from("admin_doctor_bank_masked").select("*").eq("doctor_id", id).maybeSingle()
    : { data: null };
  const profile = d.profiles as unknown as { email: string; phone: string | null; is_active: boolean };
  const tz = settings.display.admin_timezone;
  const override = commission?.find((c) => c.doctor_id === id);
  const platform = commission?.find((c) => c.doctor_id === null);
  const actions = ACTIONS[d.application_status] ?? [];

  return (
    <>
      <PageHeader
        title={`${d.title} ${d.display_name || "(no name)"}`}
        description={<>{profile.email} · {d.timezone} · fees in {d.currency}</>}
        actions={<Badge tone={d.application_status === "approved" ? "success" : "info"}>{APPLICATION_STATUS_LABELS[d.application_status as DoctorApplicationStatus]}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Professional details" action={d.application_status === "approved" ? <Link href={`/doctors/${d.slug}`} className="text-sm text-brand-700 hover:underline">Public profile</Link> : undefined} />
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Qualifications</dt><dd>{d.qualifications ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Experience</dt><dd>{d.years_experience ?? "—"} years</dd></div>
              <div><dt className="text-slate-500">Registration</dt><dd>{d.registration_number ?? "—"} · {d.registration_council ?? "—"} ({d.registration_country ?? "—"})</dd></div>
              <div><dt className="text-slate-500">Specialties</dt><dd>{(specs as unknown as { is_primary: boolean; specialties: { name: string } }[])?.map((s) => s.specialties.name + (s.is_primary ? " (primary)" : "")).join(", ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Languages</dt><dd>{d.languages?.join(", ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Fees</dt><dd>{(["chat", "audio", "video"] as const).map((m) => d[`fee_${m}`] ? `${MODE_LABELS[m]} ${formatMoney(d[`fee_${m}`], d.currency)}` : null).filter(Boolean).join(" · ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Terms accepted</dt><dd>{d.terms_accepted_at ? `${formatDateTime(d.terms_accepted_at, tz, { withZone: false })} (v${d.terms_version})` : "No"}</dd></div>
              <div><dt className="text-slate-500">Availability</dt><dd>{rules?.length ? `${rules.length} weekly windows` : "None set"}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Verification documents" description="Open each document, check it against the registration details, then verify or reject." />
            <Table>
              <thead><tr><th>Document</th><th>Status</th><th>Decision</th></tr></thead>
              <tbody>
                {creds?.length ? creds.map((c) => (
                  <tr key={c.id}>
                    <td><a href={`/api/files/credentials/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.kind.replaceAll("_", " ")}</a><span className="block text-xs text-slate-500">{c.file_name}</span></td>
                    <td><Badge tone={c.status === "verified" ? "success" : c.status === "rejected" ? "danger" : "neutral"}>{c.status}</Badge>{c.review_note && <span className="block text-xs text-slate-500">{c.review_note}</span>}</td>
                    <td>
                      <form action={reviewCredentialAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="credential_id" value={c.id} />
                        <Input name="note" placeholder="Note (required to reject)" className="max-w-48" aria-label="Note" />
                        <Button type="submit" name="status" value="verified" size="sm" variant="secondary">Verify</Button>
                        <Button type="submit" name="status" value="rejected" size="sm" variant="ghost">Reject</Button>
                      </form>
                    </td>
                  </tr>
                )) : <tr><td colSpan={3} className="text-center text-slate-500">No documents uploaded.</td></tr>}
              </tbody>
            </Table>
          </Card>

          {canFinance && <BankKycPanel doctorId={id} bank={bank as MaskedBank | null} timezone={tz} />}

          <Card>
            <CardHeader title="Recent appointments" />
            <AppointmentTable rows={appts} perspective="admin" timezone={tz} hrefBase="/admin/appointments" />
          </Card>
        </div>

        <div className="space-y-4">
          {actions.length > 0 && (
            <Card className="p-5">
              <p className="mb-3 font-medium text-slate-900">Application decision</p>
              <ActionForm action={reviewDoctorAction} submitLabel="Apply decision">
                <input type="hidden" name="doctor_id" value={id} />
                <Field label="Action" htmlFor="decision"><Select id="decision" name="decision">{actions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                <Field label="Note to the doctor" htmlFor="note" hint="Required for requests, rejections and suspensions."><Textarea id="note" name="note" rows={3} /></Field>
              </ActionForm>
            </Card>
          )}
          {hasPermission(viewer, "finance.manage") && (
            <Card className="p-5">
              <p className="font-medium text-slate-900">Commission</p>
              <p className="mt-1 text-sm text-slate-600">Current: {(override ?? platform)?.rate_bps != null ? `${((override ?? platform)!.rate_bps) / 100}%` : "10%"} {override ? "(doctor override)" : "(platform default)"}</p>
              <div className="mt-3">
                <ActionForm action={setCommissionAction} submitLabel="Set override" variant="secondary">
                  <input type="hidden" name="doctor_id" value={id} />
                  <Field label="Commission %" htmlFor="percent"><Input id="percent" name="percent" type="number" step="0.01" min={0} max={100} required /></Field>
                  <Field label="Note" htmlFor="cnote"><Input id="cnote" name="note" /></Field>
                </ActionForm>
              </div>
            </Card>
          )}
          <Card className="p-5">
            <p className="font-medium text-slate-900">Account</p>
            <p className="mt-1 text-sm text-slate-600">{profile.is_active ? "Active" : "Deactivated"}</p>
            <form action={setUserActiveAction} className="mt-3">
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="role" value="doctor" />
              <input type="hidden" name="active" value={profile.is_active ? "false" : "true"} />
              <ConfirmSubmit message={profile.is_active ? "Deactivate this account? They will be signed out of all features." : "Reactivate this account?"} variant={profile.is_active ? "danger" : "secondary"} size="sm">
                {profile.is_active ? "Deactivate account" : "Reactivate account"}
              </ConfirmSubmit>
            </form>
            <a href={`/api/statements?doctor=${id}`} download className="mt-3 block text-sm text-brand-700 hover:underline">Download earnings statement</a>
          </Card>
          <Card className="p-5">
            <p className="mb-2 font-medium text-slate-900">History</p>
            <ol className="space-y-2 text-sm">
              {events?.map((e) => (
                <li key={e.id}><span className="text-slate-500">{formatDateTime(e.created_at, tz, { withZone: false })}</span><br />{APPLICATION_STATUS_LABELS[e.to_status as DoctorApplicationStatus]}{e.note ? ` — ${e.note}` : ""}</li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
