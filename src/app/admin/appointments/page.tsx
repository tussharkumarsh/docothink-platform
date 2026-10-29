import { Temporal } from "temporal-polyfill";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import { getPlatformSettings } from "@/features/appointments/settings";
import { APPOINTMENT_STATUS_LABELS, CONSULTATION_MODES, MODE_LABELS, type AppointmentStatus, type ConsultationMode } from "@/lib/domain";
import { isValidTimezone, supportedTimezones } from "@/lib/time/format";

export default async function AdminAppointmentsPage({ searchParams }: PageProps<"/admin/appointments">) {
  await requirePermission("appointments.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const settings = await getPlatformSettings();
  const tz = isValidTimezone(s("tz")) ? s("tz") : settings.display.admin_timezone;
  // Date filters are calendar days in the selected display zone.
  const toInstant = (d: string, plus = 0) => (d ? Temporal.PlainDate.from(d).add({ days: plus }).toZonedDateTime(tz).toInstant().toString() : undefined);
  const supabase = await createClient();
  const [{ data: doctors }, { data: specialties }] = await Promise.all([
    supabase.from("doctor_profiles").select("user_id, title, display_name").order("display_name"),
    supabase.from("specialties").select("id, name").order("name"),
  ]);
  let rows = await listAppointments({
    scope: "all",
    status: (s("status") || undefined) as AppointmentStatus | undefined,
    doctorId: s("doctor") || undefined,
    mode: (s("mode") || undefined) as ConsultationMode | undefined,
    from: toInstant(s("from")),
    to: toInstant(s("to"), 1),
    limit: 300,
  });
  if (s("specialty")) rows = rows.filter((r) => r.specialty === specialties?.find((x) => x.id === s("specialty"))?.name);
  if (s("patient")) rows = rows.filter((r) => `${r.patient_name} ${r.patient_email}`.toLowerCase().includes(s("patient").toLowerCase()));

  return (
    <>
      <PageHeader title="Appointments" description="Each row also shows the doctor's and patient's own time zones." />
      <Card className="mb-4 p-4">
        <form className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Input name="from" type="date" defaultValue={s("from")} aria-label="From date" />
          <Input name="to" type="date" defaultValue={s("to")} aria-label="To date" />
          <Select name="doctor" defaultValue={s("doctor")} aria-label="Doctor"><option value="">All doctors</option>{doctors?.map((d) => <option key={d.user_id} value={d.user_id}>{d.title} {d.display_name}</option>)}</Select>
          <Select name="specialty" defaultValue={s("specialty")} aria-label="Specialty"><option value="">All specialties</option>{specialties?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <Input name="patient" defaultValue={s("patient")} placeholder="Patient" aria-label="Patient name or email" />
          <Select name="mode" defaultValue={s("mode")} aria-label="Mode"><option value="">All types</option>{CONSULTATION_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</Select>
          <Select name="status" defaultValue={s("status")} aria-label="Status"><option value="">All statuses</option>{Object.entries(APPOINTMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="tz" defaultValue={tz} aria-label="Display time zone">{supportedTimezones().map((z) => <option key={z}>{z}</option>)}</Select>
          <Button type="submit" variant="secondary" className="sm:col-span-4 lg:col-span-8">Apply filters</Button>
        </form>
      </Card>
      <Card><AppointmentTable rows={rows} perspective="admin" timezone={tz} hrefBase="/admin/appointments" /></Card>
    </>
  );
}
