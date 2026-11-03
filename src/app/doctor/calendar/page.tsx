import Link from "next/link";
import { Alert, PageHeader, buttonClasses } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time/now";
import { listAppointments } from "@/features/appointments/queries";
import { placeItems, visibleRange, weekBounds, weekDays, workingBands } from "@/features/calendar/week";
import { WeekGrid } from "@/features/calendar/components/week-grid";

const HIDDEN = new Set(["cancelled", "refunded", "expired"]);

export default async function DoctorCalendarPage({ searchParams }: PageProps<"/doctor/calendar">) {
  const viewer = await requireApprovedDoctor();
  const tz = viewer.timezone;
  const sp = await searchParams;
  const now = new Date(nowMs());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  const { days, prev, next } = weekDays(typeof sp.week === "string" ? sp.week : null, today);
  const bounds = weekBounds(days, tz);

  const supabase = await createClient();
  // An appointment that starts just before Monday can still run into it, so look a day further back.
  const from = new Date(Date.parse(bounds.from) - 86_400_000).toISOString();
  const [appointments, { data: rules, error: rulesError }, { data: exceptions, error: exceptionsError }] = await Promise.all([
    listAppointments({ doctorId: viewer.id, from, to: bounds.to, limit: 500 }),
    supabase.from("doctor_availability_rules").select("weekday, start_time, end_time, timezone").eq("doctor_id", viewer.id).eq("is_active", true),
    supabase.from("doctor_availability_exceptions").select("id, starts_at, ends_at, reason").eq("doctor_id", viewer.id).lt("starts_at", bounds.to).gt("ends_at", bounds.from),
  ]);
  if (rulesError || exceptionsError) throw new Error("Could not load calendar");

  const visible = appointments.filter((a) => !HIDDEN.has(a.status));
  const placedAppointments = placeItems(visible.map((a) => ({ id: a.id, start: a.start_at, end: a.end_at })), days, tz);
  const blocks = exceptions ?? [];
  const placedBlocks = placeItems(blocks.map((b) => ({ id: `block:${b.id}`, start: b.starts_at, end: b.ends_at })), days, tz);
  const bands = workingBands(rules ?? [], days, tz);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Times in ${tz}.`}
        actions={
          <nav aria-label="Week" className="flex gap-2">
            <Link href={`/doctor/calendar?week=${prev}`} className={buttonClasses("secondary", "sm")}>Previous</Link>
            <Link href="/doctor/calendar" className={buttonClasses("secondary", "sm")}>This week</Link>
            <Link href={`/doctor/calendar?week=${next}`} className={buttonClasses("secondary", "sm")}>Next</Link>
          </nav>
        }
      />
      {!rules?.length && (
        <Alert tone="info" className="mb-4">
          You haven&apos;t set working hours yet. <Link href="/doctor/availability" className="font-medium underline">Set your availability</Link>.
        </Alert>
      )}
      <WeekGrid
        days={days}
        today={today}
        nowMin={clock[0] * 60 + clock[1]}
        timezone={tz}
        range={visibleRange([...placedAppointments, ...bands], placedBlocks)}
        bands={bands}
        placedAppointments={placedAppointments}
        placedBlocks={placedBlocks}
        appointments={visible}
        blocks={blocks}
      />
    </>
  );
}
