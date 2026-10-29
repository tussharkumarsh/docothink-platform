import Link from "next/link";
import { Alert, Card, CardHeader, PageHeader, Stat, Table } from "@/components/ui";
import { requireRole, hasPermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  const viewer = await requireRole("admin", "/admin");
  const denied = (await searchParams).denied;
  const supabase = await createClient();
  const settings = await getPlatformSettings();
  const tz = settings.display.admin_timezone;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const now = new Date();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [patients, doctors, awaiting, upcoming, completed, cancelled, changeRequests, todayRows, ledger, payouts, activity] = await Promise.all([
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "patient")),
    count(supabase.from("doctor_profiles").select("user_id", { count: "exact", head: true }).eq("application_status", "approved")),
    count(supabase.from("doctor_profiles").select("user_id", { count: "exact", head: true }).in("application_status", ["submitted", "under_review"])),
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("start_at", now.toISOString())),
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "completed")),
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).in("status", ["cancelled", "refunded"])),
    count(supabase.from("appointment_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    supabase.from("appointments").select("start_at").in("status", ["confirmed", "in_progress", "completed"]).gte("start_at", new Date(now.getTime() - 36e5 * 36).toISOString()).lte("start_at", new Date(now.getTime() + 36e5 * 36).toISOString()),
    hasPermission(viewer, "finance.manage") ? supabase.from("financial_ledger_entries").select("currency, gross_amount, commission_amount, entry_type") : Promise.resolve({ data: [] }),
    hasPermission(viewer, "finance.manage") ? supabase.from("doctor_payouts").select("currency, amount, status").neq("status", "paid").neq("status", "failed") : Promise.resolve({ data: [] }),
    hasPermission(viewer, "audit.read") ? supabase.from("audit_logs").select("id, action, entity_type, created_at, actor_role").order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);
  const today = (todayRows.data ?? []).filter((a) => fmt.format(new Date(a.start_at)) === fmt.format(now)).length;
  const revenue = new Map<string, { gross: number; commission: number }>();
  for (const e of ledger.data ?? []) {
    if (e.entry_type === "payout") continue;
    const r = revenue.get(e.currency) ?? { gross: 0, commission: 0 };
    r.gross += e.gross_amount ?? 0;
    r.commission += e.commission_amount ?? 0;
    revenue.set(e.currency, r);
  }
  const pending = new Map<string, number>();
  for (const p of payouts.data ?? []) pending.set(p.currency, (pending.get(p.currency) ?? 0) + p.amount);
  const money = (m: Map<string, number>) => (m.size ? [...m].map(([c, v]) => formatMoney(v, c)).join(" · ") : "—");

  return (
    <>
      <PageHeader title="Overview" description={`Times shown in ${tz} (change in Platform settings).`} />
      {denied && <Alert tone="warning" className="mb-6">You need the &ldquo;{denied}&rdquo; permission for that page.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered patients" value={patients} />
        <Stat label="Approved doctors" value={doctors} />
        <Stat label="Doctors awaiting approval" value={awaiting} hint={<Link href="/admin/doctors?status=submitted" className="text-brand-700 hover:underline">Review</Link>} />
        <Stat label="Appointments today" value={today} />
        <Stat label="Upcoming confirmed" value={upcoming} />
        <Stat label="Completed consultations" value={completed} />
        <Stat label="Cancelled / refunded" value={cancelled} />
        <Stat label="Pending reschedule requests" value={changeRequests} hint={<Link href="/admin/appointments/change-requests" className="text-brand-700 hover:underline">Decide</Link>} />
      </div>
      {hasPermission(viewer, "finance.manage") && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Gross consultation revenue (earned)" value={money(new Map([...revenue].map(([c, r]) => [c, r.gross])))} />
          <Stat label="Platform commission" value={money(new Map([...revenue].map(([c, r]) => [c, r.commission])))} />
          <Stat label="Payouts not yet paid" value={money(pending)} />
        </div>
      )}
      {(activity.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader title="Recent activity" action={<Link href="/admin/audit" className="text-sm text-brand-700 hover:underline">Audit log</Link>} />
          <Table>
            <tbody>
              {activity.data!.map((a) => (
                <tr key={a.id}><td className="w-56">{formatDateTime(a.created_at, tz, { withZone: false })}</td><td>{a.action}</td><td className="text-slate-500">{a.actor_role ?? "system"}</td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
