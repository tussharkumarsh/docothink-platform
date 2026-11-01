import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader, Stat, Table } from "@/components/ui";
import { BarChart, HBar } from "@/components/charts/bar-chart";
import { hasPermission, requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { formatPrice } from "@/lib/money";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

const RANGES = [30, 90, 365] as const;

type Week = { week: string; count: number };
type Analytics = {
  totals: { bookings: number; completed: number; no_show: number; cancelled: number; new_patients: number; avg_rating: number | null };
  bookings_by_week: Week[];
  completed_by_week: Week[];
  new_patients_by_week: Week[];
  mode_split: { mode: ConsultationMode; count: number }[];
  top_doctors: { doctor_id: string; name: string; completed: number; rating_avg: number | null }[];
  top_specialties: { name: string; bookings: number }[];
  revenue_by_week?: { week: string; currency: string; gross: number; commission: number }[];
  revenue_totals?: { currency: string; gross: number; commission: number }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—");
const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const count = (v: number) => v.toLocaleString("en-US");

export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const viewer = await requireRole("admin", "/admin/analytics");
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === sp.range) ?? 30;
  const supabase = await createClient();
  const settings = await getPlatformSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.display.admin_timezone }).format(new Date());
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (range - 1) * 86_400_000).toISOString().slice(0, 10);

  const [{ data, error }, { count: demoCount }] = await Promise.all([
    supabase.rpc("admin_analytics", { p_from: from, p_to: today, p_tz: settings.display.admin_timezone }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  const a = data as Analytics | null;
  const finance = hasPermission(viewer, "finance.manage");

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${from} to ${today} (${settings.display.admin_timezone}).`}
        actions={
          <nav aria-label="Range" className="flex gap-1.5">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/analytics?range=${r}`}
                aria-current={r === range ? "page" : undefined}
                className={r === range ? "rounded-full bg-slate-900 px-3 py-1 text-[13px] font-medium text-white" : "rounded-full bg-white px-3 py-1 text-[13px] text-slate-700 ring-1 ring-black/5 hover:bg-slate-100"}
              >
                Last {r} days
              </Link>
            ))}
          </nav>
        }
      />
      {(demoCount ?? 0) > 0 && <Badge tone="warning" className="mb-4">Includes demo data</Badge>}
      {error || !a ? (
        <Card className="p-6 text-sm text-slate-600">Analytics couldn&apos;t be loaded.</Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Bookings" value={count(a.totals.bookings)} hint="created in range" />
            <Stat label="Completed consultations" value={count(a.totals.completed)} />
            <Stat label="No-show rate" value={pct(a.totals.no_show, a.totals.completed + a.totals.no_show)} hint={`${a.totals.no_show} no-shows`} />
            <Stat label="Cancellation rate" value={pct(a.totals.cancelled, a.totals.completed + a.totals.no_show + a.totals.cancelled)} hint={`${a.totals.cancelled} cancelled`} />
            <Stat label="New patients" value={count(a.totals.new_patients)} />
            <Stat label="Average rating" value={a.totals.avg_rating ? `★ ${Number(a.totals.avg_rating).toFixed(1)}` : "—"} hint="reviews in range" />
            {finance && (a.revenue_totals ?? []).map((r) => (
              <Stat key={r.currency} label={`Revenue (${r.currency})`} value={formatPrice(r.gross, r.currency)} hint={`Before refunds · commission ${formatPrice(r.commission, r.currency)}`} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bookings per week" />
              <div className="px-5 pb-5 pt-2"><BarChart title="Bookings per week" format={count} data={a.bookings_by_week.map((w) => ({ label: weekLabel(w.week), value: w.count }))} /></div>
            </Card>
            <Card>
              <CardHeader title="Completed consultations per week" />
              <div className="px-5 pb-5 pt-2"><BarChart title="Completed consultations per week" format={count} data={a.completed_by_week.map((w) => ({ label: weekLabel(w.week), value: w.count }))} /></div>
            </Card>
            {finance && [...new Set((a.revenue_by_week ?? []).map((r) => r.currency))].map((ccy) => (
              <Card key={ccy}>
                <CardHeader title={`Revenue per week (${ccy})`} description="Gross consultation value of completed consultations, before refunds." />
                <div className="px-5 pb-5 pt-2">
                  <BarChart
                    title={`Revenue per week (${ccy})`}
                    format={(v) => formatPrice(v, ccy)}
                    data={(a.revenue_by_week ?? []).filter((r) => r.currency === ccy).map((r) => ({ label: weekLabel(r.week), value: r.gross }))}
                  />
                </div>
              </Card>
            ))}
            <Card>
              <CardHeader title="New patients per week" />
              <div className="px-5 pb-5 pt-2"><BarChart title="New patients per week" format={count} data={a.new_patients_by_week.map((w) => ({ label: weekLabel(w.week), value: w.count }))} /></div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Top doctors" description="By completed consultations in range." />
              <Table>
                <thead><tr><th>Doctor</th><th className="text-right">Completed</th><th className="text-right">Rating</th></tr></thead>
                <tbody>
                  {a.top_doctors.length ? a.top_doctors.map((d) => (
                    <tr key={d.doctor_id}>
                      <td><Link href={`/admin/doctors/${d.doctor_id}`} className="text-brand-700 hover:underline">{d.name}</Link></td>
                      <td className="text-right tabular-nums">{d.completed}</td>
                      <td className="text-right tabular-nums">{d.rating_avg ? `★ ${Number(d.rating_avg).toFixed(1)}` : "—"}</td>
                    </tr>
                  )) : <tr><td colSpan={3} className="text-center text-slate-500">No completed consultations in range.</td></tr>}
                </tbody>
              </Table>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Consultation types" />
                <div className="px-5 pb-5 pt-2">
                  <HBar title="Bookings by consultation type" format={count} data={a.mode_split.map((m) => ({ label: MODE_LABELS[m.mode] ?? m.mode, value: m.count }))} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Top specialties" />
                <div className="px-5 pb-5 pt-2">
                  <HBar title="Bookings by specialty" format={count} data={a.top_specialties.map((s) => ({ label: s.name, value: s.bookings }))} />
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
