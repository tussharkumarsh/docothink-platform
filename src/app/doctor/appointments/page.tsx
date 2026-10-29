import { nowMs } from "@/lib/time/now";
import Link from "next/link";
import { Card, PageHeader, cn } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";

const TABS = [
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["past", "History"],
] as const;

export default async function DoctorAppointmentsPage({ searchParams }: PageProps<"/doctor/appointments">) {
  const viewer = await requireApprovedDoctor();
  const tab = (await searchParams).tab;
  const active = TABS.find(([t]) => t === tab)?.[0] ?? "today";
  let rows;
  if (active === "today") {
    // "Today" is the doctor's local calendar day, converted to UTC bounds for the query.
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone });
    const todayKey = fmt.format(new Date());
    const all = await listAppointments({ from: new Date(nowMs() - 36 * 3_600_000).toISOString(), to: new Date(nowMs() + 36 * 3_600_000).toISOString(), scope: "today" });
    rows = all.filter((a) => fmt.format(new Date(a.start_at)) === todayKey);
  } else {
    rows = await listAppointments({ scope: active });
  }
  return (
    <>
      <PageHeader title="Appointments" description={`Times in ${viewer.timezone}.`} />
      <div className="mb-4 flex gap-2" role="tablist">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`?tab=${t}`} role="tab" aria-selected={active === t} className={cn("rounded-lg px-3 py-1.5 text-sm", active === t ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{label}</Link>
        ))}
      </div>
      <Card><AppointmentTable rows={rows} perspective="doctor" timezone={viewer.timezone} hrefBase="/doctor/appointments" /></Card>
    </>
  );
}
