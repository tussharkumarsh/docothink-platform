import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time/format";

export default async function AdminPatientsPage({ searchParams }: PageProps<"/admin/patients">) {
  await requirePermission("patients.manage");
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).slice(0, 80).replace(/[%_,()]/g, "") : "";
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, email, country, timezone, is_active, created_at").eq("role", "patient").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await query;
  return (
    <>
      <PageHeader title="Patients" description="Account information only. Clinical records require the clinical-access permission and are audited." />
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name or email" className="max-w-sm" aria-label="Search patients" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><th>Patient</th><th>Country</th><th>Time zone</th><th>Joined</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id}>
                <td><p className="font-medium text-slate-900">{p.full_name || "—"}</p><p className="text-xs text-slate-500">{p.email}</p></td>
                <td>{p.country ?? "—"}</td>
                <td className="text-xs">{p.timezone}</td>
                <td>{formatDate(p.created_at)}</td>
                <td>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                <td className="text-right"><Link href={`/admin/patients/${p.id}`} className="text-sm text-brand-700 hover:underline">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
