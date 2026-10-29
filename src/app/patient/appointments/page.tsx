import Link from "next/link";
import { ButtonLink, Card, PageHeader, cn } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";

export default async function PatientAppointmentsPage({ searchParams }: PageProps<"/patient/appointments">) {
  const viewer = await requireRole("patient", "/patient/appointments");
  const tab = (await searchParams).tab === "past" ? "past" : "upcoming";
  const rows = await listAppointments({ scope: tab });
  return (
    <>
      <PageHeader title="Appointments" actions={<ButtonLink href="/doctors">Book a consultation</ButtonLink>} />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["upcoming", "past"] as const).map((t) => (
          <Link key={t} href={`?tab=${t}`} role="tab" aria-selected={tab === t} className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", tab === t ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
            {t}
          </Link>
        ))}
      </div>
      <Card><AppointmentTable rows={rows} perspective="patient" timezone={viewer.timezone} hrefBase="/patient/appointments" /></Card>
    </>
  );
}
