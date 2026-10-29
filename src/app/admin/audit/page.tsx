import { Button, Card, Input, PageHeader, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { formatDateTime } from "@/lib/time/format";

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermission("audit.read");
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action.replace(/[%_,()]/g, "").slice(0, 60) : "";
  const entity = typeof sp.entity === "string" && /^[0-9a-f-]{36}$/i.test(sp.entity) ? sp.entity : "";
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, profiles:actor_id(email)").order("created_at", { ascending: false }).limit(300);
  if (action) query = query.ilike("action", `${action}%`);
  if (entity) query = query.eq("entity_id", entity);
  const [{ data }, settings] = await Promise.all([query, getPlatformSettings()]);
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sensitive actions and record access. Contains no clinical content." />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="action" defaultValue={action} placeholder="Action prefix, e.g. patient_record" className="max-w-xs" aria-label="Action" />
        <Input name="entity" defaultValue={entity} placeholder="Entity id" className="max-w-xs" aria-label="Entity id" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="whitespace-nowrap">{formatDateTime(a.created_at, settings.display.admin_timezone, { withZone: false })}</td>
                <td>{(a.profiles as unknown as { email: string } | null)?.email ?? "system"}<span className="block text-xs text-slate-500">{a.actor_role}</span></td>
                <td className="font-mono text-xs">{a.action}</td>
                <td className="text-xs">{a.entity_type}<span className="block font-mono text-slate-500">{a.entity_id}</span></td>
                <td className="max-w-xs break-all font-mono text-xs text-slate-600">{Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
