"use client";

import { useMemo, useState } from "react";
import { useBrowserTimezone } from "@/lib/time/use-browser-timezone";
import { useRouter } from "next/navigation";
import { CalendarX2, Globe2 } from "lucide-react";
import { Button, EmptyState, Select, cn } from "@/components/ui";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import type { Slot } from "@/lib/time/slots";

type Props = {
  doctorSlug: string;
  doctorTimezone: string;
  currency: string;
  fees: { mode: ConsultationMode; fee: number }[];
  slots: Slot[];
  timezones: string[];
  initialTimezone?: string;
};

const dateKey = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function SlotPicker({ doctorSlug, doctorTimezone, currency, fees, slots, timezones, initialTimezone }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ConsultationMode | undefined>(fees[0]?.mode);
  const browserTz = useBrowserTimezone();
  const [chosenTz, setTz] = useState<string>();
  const tz = chosenTz ?? initialTimezone ?? browserTz;
  const [day, setDay] = useState<string>();
  const [selected, setSelected] = useState<string>();


  const available = useMemo(() => slots.filter((s) => !mode || s.modes.includes(mode)), [slots, mode]);
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of available) {
      const key = dateKey(s.start, tz);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return Array.from(map, ([key, list]) => ({ key, list }));
  }, [available, tz]);

  const activeDay = days.find((d) => d.key === day) ?? days[0];
  const fee = fees.find((f) => f.mode === mode)?.fee;

  if (fees.length === 0) {
    return <p className="text-sm text-slate-500">This doctor has not set consultation fees yet.</p>;
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">1. Consultation type</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {fees.map((f) => (
            <label
              key={f.mode}
              className={cn(
                "cursor-pointer rounded-lg border p-3 text-sm transition",
                mode === f.mode ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={f.mode}
                checked={mode === f.mode}
                onChange={() => { setMode(f.mode); setSelected(undefined); }}
                className="sr-only"
              />
              <span className="block font-medium text-slate-900">{MODE_LABELS[f.mode]}</span>
              <span className="text-slate-600">{formatMoney(f.fee, currency)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="tz" className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Globe2 className="size-4" aria-hidden /> 2. Your time zone
        </label>
        <Select id="tz" value={tz} onChange={(e) => { setTz(e.target.value); setDay(undefined); }} className="mt-2">
          {(timezones.includes(tz) ? timezones : [tz, ...timezones]).map((z) => <option key={z}>{z}</option>)}
        </Select>
        <p className="mt-1 text-xs text-slate-500">The doctor works in {doctorTimezone}. Times below are converted for each date, including daylight saving.</p>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">3. Date and time</p>
        {days.length === 0 ? (
          <EmptyState icon={<CalendarX2 className="size-6" aria-hidden />} title="No open slots" description="This doctor has no available times for this consultation type in the coming days." />
        ) : (
          <>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Dates">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="tab"
                  aria-selected={activeDay?.key === d.key}
                  onClick={() => { setDay(d.key); setSelected(undefined); }}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-2 text-center text-sm",
                    activeDay?.key === d.key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span className="block font-medium">
                    {new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(new Date(`${d.key}T12:00:00Z`))}
                  </span>
                  <span className="block text-xs">
                    {new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d.key}T12:00:00Z`))}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Available times">
              {activeDay?.list.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  role="radio"
                  aria-checked={selected === s.start}
                  onClick={() => setSelected(s.start)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm tabular-nums",
                    selected === s.start ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 hover:border-brand-300",
                  )}
                >
                  {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(s.start))}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">All times in {tz}.</p>
          </>
        )}
      </div>

      {selected && mode && fee != null && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-900">
            {new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date(selected))} — {tz}
          </p>
          <p className="text-slate-600">
            {MODE_LABELS[mode]} · {formatMoney(fee, currency)}
          </p>
          <Button
            className="mt-3 w-full"
            onClick={() =>
              router.push(`/book?doctor=${encodeURIComponent(doctorSlug)}&mode=${mode}&start=${encodeURIComponent(selected)}&tz=${encodeURIComponent(tz)}`)
            }
          >
            Continue to booking
          </Button>
        </div>
      )}
    </div>
  );
}
