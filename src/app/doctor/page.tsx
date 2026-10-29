import Link from "next/link";
import { Video } from "lucide-react";
import { Alert, ButtonLink, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import { getPlatformSettings, joinWindow } from "@/features/appointments/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";

export default async function DoctorDashboard() {
  const viewer = await requireApprovedDoctor();
  const supabase = await createClient();
  const [upcoming, settings, { data: ledger }, { count: rules }] = await Promise.all([
    listAppointments({ scope: "upcoming", limit: 20 }),
    getPlatformSettings(),
    supabase.from("financial_ledger_entries").select("amount, currency, entry_type"),
    supabase.from("doctor_availability_rules").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const balances = new Map<string, number>();
  for (const e of ledger ?? []) balances.set(e.currency, (balances.get(e.currency) ?? 0) + e.amount);
  const live = upcoming.filter((a) => (a.status === "confirmed" || a.status === "in_progress") && joinWindow(a.start_at, a.end_at, settings.consultation).open);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
  const today = upcoming.filter((a) => new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date(a.start_at)) === todayKey);

  return (
    <>
      <PageHeader title="Dashboard" description={`All times in ${viewer.timezone}.`} />
      {!rules && <Alert tone="warning" className="mb-6">You have no availability yet, so patients can&apos;t book you. <Link href="/doctor/availability" className="underline">Add your hours</Link>.</Alert>}
      {live.map((a) => (
        <Alert key={a.id} tone="success" className="mb-4" title={`Consultation ${a.status === "in_progress" ? "in progress" : "ready to start"}: ${a.patient_name ?? "patient"}`}>
          {formatDateTime(a.start_at, viewer.timezone)}
          <div className="mt-2"><ButtonLink href={`/consult/${a.id}`} size="sm"><Video className="size-4" aria-hidden /> {a.status === "in_progress" ? "Rejoin" : "Start consultation"}</ButtonLink></div>
        </Alert>
      ))}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Today" value={today.length} hint="appointments" />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Unpaid balance" value={balances.size ? [...balances].map(([c, v]) => formatMoney(v, c)).join(" · ") : formatMoney(0, "INR")} hint={<Link href="/doctor/earnings" className="text-brand-700 hover:underline">Earnings</Link>} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Upcoming appointments" action={<Link href="/doctor/appointments" className="text-sm text-brand-700 hover:underline">All appointments</Link>} />
        <AppointmentTable rows={upcoming} perspective="doctor" timezone={viewer.timezone} hrefBase="/doctor/appointments" />
      </Card>
    </>
  );
}
