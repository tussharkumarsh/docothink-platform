"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, submitKeepingValues } from "@/components/ui/form-client";
import { addExceptionAction } from "@/features/doctor/actions";
import { idle, type ActionResult } from "@/lib/errors";
import { blockEnd, isBlockable, type BlockLength } from "../block";

const pad = (n: number) => String(n).padStart(2, "0");
const toTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const OpenBlockContext = createContext<(date: string, min: number) => void>(() => undefined);

function BlockForm({ date: initialDate, min, timezone, onDone }: { date: string; min: number; timezone: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionResult, FormData>(addExceptionAction, idle);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(toTime(min));
  const [length, setLength] = useState<BlockLength>("60");
  const end = date && time ? blockEnd(date, toMinutes(time), length) : { end_date: "", end_time: "" };

  const blocked = state.ok && Boolean(state.message);

  // Stay open when the action warns about a clash, so the doctor reads it.
  useEffect(() => {
    if (state.ok && state.message === "Time blocked.") onDone();
  }, [state, onDone]);

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Block time</h2>
      <p className="text-xs text-slate-500">Times in {timezone}. Patients can&apos;t book blocked time.</p>
      <FormMessage state={state} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="end_date" value={end.end_date} />
      <input type="hidden" name="end_time" value={end.end_time} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="block-date"><Input id="block-date" name="start_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Start" htmlFor="block-start"><Input id="block-start" name="start_time" type="time" step={1800} value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
      </div>
      <Field label="Length" htmlFor="block-length">
        <Select id="block-length" value={length} onChange={(e) => setLength(e.target.value as BlockLength)}>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="rest">Rest of day</option>
        </Select>
      </Field>
      <Field label="Reason (optional)" htmlFor="block-reason"><Input id="block-reason" name="reason" maxLength={200} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{blocked ? "Close" : "Cancel"}</Button>
        {!blocked && <SubmitButton pendingText="Blocking…">Block time</SubmitButton>}
      </div>
    </form>
  );
}

/** Holds the one block dialog the week's cells and buttons open. */
export function BlockProvider({ timezone, children }: { timezone: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<{ key: number; date: string; min: number } | null>(null);
  const close = useCallback(() => dialogRef.current?.close(), []);
  const open = useCallback((date: string, min: number) => {
    // A new key gives each opening a fresh form, without the last result showing.
    setTarget((t) => ({ key: (t?.key ?? 0) + 1, date, min }));
    dialogRef.current?.showModal();
  }, []);

  return (
    <OpenBlockContext.Provider value={open}>
      {children}
      <dialog ref={dialogRef} aria-label="Block time" className="m-auto w-[calc(100vw-2rem)] max-w-sm rounded-2xl p-5 shadow-xl backdrop:bg-slate-900/40">
        {target && <BlockForm key={target.key} date={target.date} min={target.min} timezone={timezone} onDone={close} />}
      </dialog>
    </OpenBlockContext.Provider>
  );
}

/** A day column: clicking free, unpassed time opens the dialog at that half hour. */
export function DayColumn({ date, today, nowMin, rangeFrom, rowPx, children, ...props }: ComponentProps<"div"> & { date: string; today: string; nowMin: number; rangeFrom: number; rowPx: number }) {
  const open = useContext(OpenBlockContext);
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-item]")) return;
    const min = rangeFrom + Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / rowPx) * 30;
    if (isBlockable(date, min, today, nowMin)) open(date, Math.min(min, 1410));
  }
  return <div {...props} onClick={onClick}>{children}</div>;
}

/** Keyboard path to the same dialog, one per day that isn't over. */
export function BlockDayButton({ date, startMin, label }: { date: string; startMin: number; label: string }) {
  const open = useContext(OpenBlockContext);
  return (
    <button type="button" aria-label={`Block time on ${label}`} onClick={() => open(date, startMin)} className="block w-full truncate text-[11px] font-normal text-brand-700 hover:underline">
      Block time
    </button>
  );
}
