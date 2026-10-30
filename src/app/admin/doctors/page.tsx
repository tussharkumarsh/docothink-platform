import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Select, Table } from "@/components/ui";
import { hasPermission, requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUS_LABELS, type DoctorApplicationStatus } from "@/lib/domain";
import { formatDate } from "@/lib/time/format";

export default async function AdminDoctorsPage({ searchParams }: PageProps<"/admin/doctors">) {
  const viewer = await requirePermission("doctors.manage");
  const canFinance = hasPermission(viewer, "finance.manage");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const kycPending = canFinance && sp.kyc === "pending";
  const supabase = await createClient();
  let query = supabase
    .from("doctor_profiles")
    .select("user_id, title, display_name, qualifications, country, currency, application_status, submitted_at, created_at, profiles(email, is_active), doctor_specialties(is_primary, specialties(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("application_status", status);
  if (q) query = query.ilike("display_name", `%${q.replace(/[%_,()]/g, "")}%`);
  if (kycPending) {
    const { data: pending } = await supabase.from("admin_doctor_bank_masked").select("doctor_id").eq("kyc_status", "pending");
    query = query.in("user_id", (pending ?? []).map((p) => p.doctor_id));
  }
  const { data } = await query;

  return (
    <>
      <PageHeader title="Doctors" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by name" className="max-w-xs" aria-label="Search by name" />
        <Select name="status" defaultValue={status} className="max-w-xs" aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(APPLICATION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {canFinance && (
          <label className="flex items-center gap-2 px-2 text-sm text-slate-700">
            <input type="checkbox" name="kyc" value="pending" defaultChecked={kycPending} /> Bank &amp; KYC awaiting verification
          </label>
        )}
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><th>Doctor</th><th>Specialty</th><th>Country</th><th>Status</th><th>Submitted</th><th /></tr></thead>
          <tbody>
            {data?.map((d) => {
              const p = d.profiles as unknown as { email: string; is_active: boolean } | null;
              const spec = (d.doctor_specialties as unknown as { is_primary: boolean; specialties: { name: string } }[]).find((s) => s.is_primary)?.specialties.name;
              return (
                <tr key={d.user_id}>
                  <td><p className="font-medium text-slate-900">{d.title} {d.display_name || "(no name yet)"}</p><p className="text-xs text-slate-500">{p?.email}</p></td>
                  <td>{spec ?? "—"}</td>
                  <td>{d.country ?? "—"}</td>
                  <td>
                    <Badge tone={d.application_status === "approved" ? "success" : ["submitted", "under_review"].includes(d.application_status) ? "info" : d.application_status === "info_required" ? "warning" : "neutral"}>
                      {APPLICATION_STATUS_LABELS[d.application_status as DoctorApplicationStatus]}
                    </Badge>
                    {p && !p.is_active && <Badge tone="danger" className="ml-1">Deactivated</Badge>}
                  </td>
                  <td>{d.submitted_at ? formatDate(d.submitted_at) : "—"}</td>
                  <td className="text-right"><Link href={`/admin/doctors/${d.user_id}`} className="text-sm font-medium text-brand-700 hover:underline">Review</Link></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
