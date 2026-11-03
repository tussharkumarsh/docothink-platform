import Link from "next/link";
import { X } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/form-client";
import { deleteExceptionAction } from "@/features/doctor/actions";
import { APPOINTMENT_STATUS_LABELS, MODE_LABELS } from "@/lib/domain";
import { formatDateTime, formatTime } from "@/lib/time/format";
import type { AppointmentRow } from "@/features/appointments/queries";
import { nextBlockStart } from "../block";
import type { Placed } from "../week";
import { BlockDayButton, BlockProvider, DayColumn } from "./block-dialog";

/** Height of one 30-minute row. */
const ROW_PX = 28;
const HATCH = { backgroundImage: "repeating-linear-gradient(135deg, #e2e8f0 0 6px, #f8fafc 6px 12px)" };

export type CalendarBlock = { id: string; starts_at: string; ends_at: string; reason: string | null };

type Props = {
  days: string[];
  today: string;
  nowMin: number;
  timezone: string;
  range: { from: number; to: number };
  bands: { date: string; startMin: number; endMin: number }[];
  placedAppointments: Placed[];
  placedBlocks: Placed[];
  appointments: AppointmentRow[];
  blocks: CalendarBlock[];
};

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
const px = (minutes: number) => (minutes / 30) * ROW_PX;
const hourLabel = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`;

function appointmentTone(a: AppointmentRow, past: boolean) {
  if (a.status === "pending_payment") return "border border-dashed border-slate-300 bg-white text-slate-500";
  return cn("bg-brand-50 text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100", past && "opacity-60");
}

const appointmentStatus = (a: AppointmentRow) => (a.status === "pending_payment" ? "Awaiting payment" : APPOINTMENT_STATUS_LABELS[a.status]);

function AppointmentChip({ a, timezone, past }: { a: AppointmentRow; timezone: string; past: boolean }) {
  const detail = `${formatTime(a.start_at, timezone)} ${a.patient_name ?? "Patient"}, ${MODE_LABELS[a.mode]}, ${appointmentStatus(a)}`;
  return (
    <Link href={`/doctor/appointments/${a.id}`} data-item aria-label={detail} title={detail} className={cn("block h-full overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight", appointmentTone(a, past))}>
      <span className="font-medium tabular-nums">{formatTime(a.start_at, timezone)}</span> {a.patient_name ?? "Patient"}
      <span className="block truncate">{MODE_LABELS[a.mode]} · {appointmentStatus(a)}</span>
    </Link>
  );
}

function BlockChip({ b, timezone }: { b: CalendarBlock; timezone: string }) {
  const range = `${formatDateTime(b.starts_at, timezone, { withZone: false })} to ${formatDateTime(b.ends_at, timezone, { withZone: false })}`;
  return (
    <div data-item title={`Blocked ${range}`} style={HATCH} className="relative h-full overflow-hidden rounded-md py-0.5 pl-1.5 pr-6 text-[11px] leading-tight text-slate-700 ring-1 ring-slate-200">
      <span className="font-medium">Blocked</span>{b.reason ? ` · ${b.reason}` : ""}
      <form action={deleteExceptionAction} className="absolute right-0.5 top-0.5">
        <input type="hidden" name="exception_id" value={b.id} />
        <ConfirmSubmit variant="ghost" size="sm" aria-label={`Remove block, ${range}`} message={`Remove this block? ${range}`} className="size-5 min-h-0 rounded p-0">
          <X className="size-3" aria-hidden />
        </ConfirmSubmit>
      </form>
    </div>
  );
}

export function WeekGrid({ days, today, nowMin, timezone, range, bands, placedAppointments, placedBlocks, appointments, blocks }: Props) {
  const apptById = new Map(appointments.map((a) => [a.id, a]));
  const blockById = new Map(blocks.map((b) => [`block:${b.id}`, b]));
  const height = px(range.to - range.from);
  const hours: number[] = [];
  for (let m = range.from; m < range.to; m += 60) hours.push(m);
  const isPast = (p: Placed) => p.date < today || (p.date === today && p.endMin <= nowMin);
  const placedOn = (date: string) => [...placedAppointments, ...placedBlocks].filter((p) => p.date === date);
  const blockStart = (date: string) => nextBlockStart(date, today, nowMin, bands.filter((b) => b.date === date).map((b) => b.startMin).sort((x, y) => x - y)[0]);
  const blockButton = (date: string, label: string) => {
    const start = blockStart(date);
    return start === null ? null : <BlockDayButton date={date} startMin={start} label={label} />;
  };

  return (
    <BlockProvider timezone={timezone}>
      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-slate-100 text-center text-xs">
          <div />
          {days.map((d) => (
            <div key={d} className={cn("border-l border-slate-100 px-1 py-2 font-medium", d === today ? "text-brand-700" : "text-slate-700")} aria-current={d === today ? "date" : undefined}>
              {dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}
              {blockButton(d, dayLabel(d, { weekday: "long", day: "numeric", month: "long" }))}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 text-[11px] tabular-nums text-slate-500" style={{ top: px(m - range.from) }}>{hourLabel(m)}</span>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d} date={d} today={today} nowMin={nowMin} rangeFrom={range.from} rowPx={ROW_PX} className={cn("relative overflow-hidden border-l border-slate-100 bg-slate-100", blockStart(d) !== null && "cursor-pointer")} style={{ height }}>
              {bands.filter((b) => b.date === d).map((b) => (
                <div key={`${b.startMin}-${b.endMin}`} className="absolute inset-x-0 bg-white" style={{ top: px(b.startMin - range.from), height: px(b.endMin - b.startMin) }} />
              ))}
              {hours.map((m) => <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-slate-200/70" style={{ top: px(m - range.from) }} />)}
              {placedOn(d).map((p) => {
                const a = apptById.get(p.id);
                const b = blockById.get(p.id);
                const start = Math.max(p.startMin, range.from);
                const end = Math.min(p.endMin, range.to);
                if (end <= start) return null;
                return (
                  <div
                    key={p.id}
                    className="absolute p-px"
                    style={{ top: px(start - range.from), height: px(end - start), left: `${(p.column / p.columns) * 100}%`, width: `${100 / p.columns}%` }}
                  >
                    {a && <AppointmentChip a={a} timezone={timezone} past={isPast(p)} />}
                    {b && <BlockChip b={b} timezone={timezone} />}
                  </div>
                );
              })}
            </DayColumn>
          ))}
        </div>
      </Card>

      <div className="space-y-3 md:hidden">
        {days.map((d) => {
          const items = placedOn(d).sort((x, y) => x.startMin - y.startMin);
          return (
            <Card key={d} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className={cn("text-sm font-semibold", d === today ? "text-brand-700" : "text-slate-900")} aria-current={d === today ? "date" : undefined}>
                  {dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <div className="shrink-0">{blockButton(d, dayLabel(d, { weekday: "long", day: "numeric", month: "long" }))}</div>
              </div>
              {items.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Nothing scheduled.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((p) => {
                    const a = apptById.get(p.id);
                    const b = blockById.get(p.id);
                    return (
                      <li key={p.id} className="min-h-11">
                        {a && <AppointmentChip a={a} timezone={timezone} past={isPast(p)} />}
                        {b && <BlockChip b={b} timezone={timezone} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </BlockProvider>
  );
}
