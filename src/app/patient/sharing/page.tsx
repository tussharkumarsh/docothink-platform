import { nowMs } from "@/lib/time/now";
import { Card, CardHeader, Field, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { revokeShareAction, shareRecordsAction } from "@/features/account/actions";
import { formatDate } from "@/lib/time/format";

export default async function SharingPage() {
  const viewer = await requireRole("patient", "/patient/sharing");
  const supabase = await createClient();
  const [{ data: grants }, { data: doctors }] = await Promise.all([
    supabase.from("clinical_access_grants").select("id, source, reason, expires_at, revoked_at, created_at, doctor_profiles(title, display_name)").eq("patient_id", viewer.id).order("created_at", { ascending: false }),
    supabase.from("doctor_profiles").select("user_id, title, display_name").eq("application_status", "approved").order("display_name"),
  ]);
  return (
    <>
      <PageHeader
        title="Record sharing"
        description="Doctors you book with can see your records from confirmation. Here you can share with another doctor (for example a second opinion) and revoke access at any time."
      />
      <Card className="mb-6">
        <CardHeader title="Share my records with a doctor" />
        <div className="p-5">
          <ActionForm action={shareRecordsAction} submitLabel="Share records">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Doctor" htmlFor="doctor_id">
                <Select id="doctor_id" name="doctor_id" required defaultValue="">
                  <option value="" disabled>Choose a doctor</option>
                  {doctors?.map((d) => <option key={d.user_id} value={d.user_id}>{d.title} {d.display_name}</option>)}
                </Select>
              </Field>
              <Field label="For how long" htmlFor="days">
                <Select id="days" name="days" defaultValue="30">
                  <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
                </Select>
              </Field>
            </div>
            <Field label="Reason" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} placeholder="e.g. Second opinion on my blood test results" required /></Field>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHeader title="Access granted" />
        <Table>
          <thead><tr><th>Doctor</th><th>Source</th><th>Reason</th><th>Expires</th><th /></tr></thead>
          <tbody>
            {grants?.length ? grants.map((g) => {
              const doc = g.doctor_profiles as unknown as { title: string; display_name: string } | null;
              const active = !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at) > nowMs());
              return (
                <tr key={g.id}>
                  <td>{doc ? `${doc.title} ${doc.display_name}` : "—"}</td>
                  <td>{g.source === "patient_share" ? "Shared by you" : "Referral by support"}</td>
                  <td className="max-w-xs truncate">{g.reason}</td>
                  <td>{g.revoked_at ? "Revoked" : g.expires_at ? formatDate(g.expires_at, viewer.timezone) : "—"}</td>
                  <td className="text-right">
                    {active && (
                      <form action={revokeShareAction}>
                        <input type="hidden" name="grant_id" value={g.id} />
                        <ConfirmSubmit message="Revoke this doctor's access to your records?" size="sm" variant="secondary">Revoke</ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={5} className="text-center text-slate-500">You haven&apos;t shared your records with anyone else.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
