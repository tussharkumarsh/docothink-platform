import { Temporal } from "temporal-polyfill";
import { Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { addExceptionAction, addRuleAction, deleteExceptionAction, deleteRuleAction, updateBookingSettingsAction } from "@/features/doctor/actions";
import { generateSlots, groupSlotsByLocalDate } from "@/lib/time/slots";
import { CONSULTATION_MODES, MODE_LABELS, type ConsultationMode } from "@/lib/domain";
import { formatDate, formatDateTime, formatTime } from "@/lib/time/format";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function AvailabilityPage() {
  const viewer = await requireRole("doctor", "/doctor/availability");
  const supabase = await createClient();
  const now = Temporal.Now.instant();
  const [{ data: doctor }, { data: rules }, { data: exceptions }, { data: busy }] = await Promise.all([
    supabase.from("doctor_profiles").select("timezone, booking_horizon_days, min_notice_minutes, is_accepting_bookings").eq("user_id", viewer.id).single(),
    supabase.from("doctor_availability_rules").select("*").eq("doctor_id", viewer.id).order("weekday").order("start_time"),
    supabase.from("doctor_availability_exceptions").select("*").eq("doctor_id", viewer.id).gte("ends_at", now.toString()).order("starts_at"),
    supabase.rpc("get_doctor_busy_intervals", { p_doctor: viewer.id, p_from: now.toString(), p_to: now.add({ hours: 24 * 9 }).toString() }),
  ]);
  if (!doctor) return null;
  const tz = doctor.timezone;
  const preview = groupSlotsByLocalDate(
    generateSlots({
      rules: (rules ?? []).filter((r) => r.is_active).map((r) => ({ weekday: r.weekday, startTime: r.start_time, endTime: r.end_time, timezone: r.timezone, slotMinutes: r.slot_minutes, bufferMinutes: r.buffer_minutes, modes: r.modes as ConsultationMode[] })),
      busy: ((busy as { starts_at: string; ends_at: string }[]) ?? []).map((b) => ({ start: b.starts_at, end: b.ends_at })),
      doctorTimezone: tz,
      horizonDays: Math.min(7, doctor.booking_horizon_days),
      minNoticeMinutes: doctor.min_notice_minutes,
      now,
    }),
    tz,
  );

  return (
    <>
      <PageHeader title="Availability" description={`Enter your hours in your own time zone (${tz}). Patients see them converted to theirs, including daylight saving changes.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weekly hours" />
          {rules?.length ? (
            <Table>
              <thead><tr><th>Day</th><th>Hours</th><th>Slots</th><th>Types</th><th /></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{DAYS[r.weekday - 1]}</td>
                    <td className="tabular-nums">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}{r.timezone !== tz && <span className="block text-xs text-amber-700">{r.timezone}</span>}</td>
                    <td className="text-xs">{r.slot_minutes} min{r.buffer_minutes ? ` + ${r.buffer_minutes} buffer` : ""}</td>
                    <td className="text-xs">{(r.modes as ConsultationMode[]).map((m) => MODE_LABELS[m]).join(", ")}</td>
                    <td className="text-right">
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm" aria-label="Remove window"><Trash2 className="size-4" aria-hidden /></Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="p-5 text-sm text-slate-500">No weekly hours yet.</p>
          )}
          <div className="border-t border-slate-100 p-5">
            <p className="mb-3 text-sm font-medium text-slate-900">Add a window</p>
            <ActionForm action={addRuleAction} submitLabel="Add hours">
              <input type="hidden" name="timezone" value={tz} />
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1 text-sm text-slate-700">Days</legend>
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs">
                    <input type="checkbox" name="weekdays" value={i + 1} /> {d.slice(0, 3)}
                  </label>
                ))}
              </fieldset>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="From" htmlFor="start_time"><Input id="start_time" name="start_time" type="time" defaultValue="09:00" required /></Field>
                <Field label="To" htmlFor="end_time" hint="Use 24:00 for midnight"><Input id="end_time" name="end_time" defaultValue="13:00" pattern="([01]\d|2[0-3]):[0-5]\d|24:00" required /></Field>
                <Field label="Slot length" htmlFor="slot_minutes">
                  <Select id="slot_minutes" name="slot_minutes" defaultValue="20">{[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
                </Field>
                <Field label="Buffer" htmlFor="buffer_minutes">
                  <Select id="buffer_minutes" name="buffer_minutes" defaultValue="10">{[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
                </Field>
              </div>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="mb-1 text-sm text-slate-700">Consultation types in this window</legend>
                {CONSULTATION_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-1 text-sm"><input type="checkbox" name="modes" value={m} defaultChecked /> {MODE_LABELS[m]}</label>
                ))}
              </fieldset>
            </ActionForm>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Next 7 days (preview)" description="Exactly what patients can book now. Booked and blocked times are excluded." />
            <div className="max-h-96 space-y-3 overflow-y-auto p-5">
              {preview.length === 0 ? <p className="text-sm text-slate-500">No bookable slots in the next 7 days.</p> : preview.map((day) => (
                <div key={day.date}>
                  <p className="text-sm font-medium text-slate-900">{formatDate(day.date)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {day.slots.map((s) => <Badge key={s.start}>{formatTime(s.start, tz)}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Leave & holidays" description="Blocks new bookings in this period." />
            <div className="space-y-4 p-5">
              {exceptions?.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{formatDateTime(e.starts_at, tz, { withZone: false })} → {formatDateTime(e.ends_at, tz, { withZone: false })}{e.reason ? ` · ${e.reason}` : ""}</span>
                  <form action={deleteExceptionAction}>
                    <input type="hidden" name="exception_id" value={e.id} />
                    <Button type="submit" variant="ghost" size="sm">Remove</Button>
                  </form>
                </div>
              ))}
              <ActionForm action={addExceptionAction} submitLabel="Block time">
                <input type="hidden" name="timezone" value={tz} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From date" htmlFor="start_date"><Input id="start_date" name="start_date" type="date" required /></Field>
                  <Field label="To date" htmlFor="end_date"><Input id="end_date" name="end_date" type="date" required /></Field>
                  <Field label="From time (optional)" htmlFor="ex_start_time"><Input id="ex_start_time" name="start_time" type="time" /></Field>
                  <Field label="To time (optional)" htmlFor="ex_end_time"><Input id="ex_end_time" name="end_time" type="time" /></Field>
                </div>
                <Field label="Reason (private)" htmlFor="ex_reason"><Input id="ex_reason" name="reason" maxLength={200} /></Field>
              </ActionForm>
            </div>
          </Card>

          <Card>
            <CardHeader title="Booking settings" />
            <div className="p-5">
              <ActionForm action={updateBookingSettingsAction} submitLabel="Save settings">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bookable days ahead" htmlFor="booking_horizon_days" hint="Rolling window, e.g. 7"><Input id="booking_horizon_days" name="booking_horizon_days" type="number" min={1} max={60} defaultValue={doctor.booking_horizon_days} /></Field>
                  <Field label="Minimum notice (minutes)" htmlFor="min_notice_minutes"><Input id="min_notice_minutes" name="min_notice_minutes" type="number" min={0} max={10080} defaultValue={doctor.min_notice_minutes} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_accepting_bookings" defaultChecked={doctor.is_accepting_bookings} /> Accepting new bookings</label>
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
