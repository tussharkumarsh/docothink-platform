"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { idle, type ActionResult } from "@/lib/errors";
import { revealBankAction, type RevealedBank } from "../actions";

/** Full numbers are fetched on demand and held only in this component's state. Each reveal is audit-logged. */
export function RevealBank({ doctorId }: { doctorId: string }) {
  const [state, action, pending] = useActionState<ActionResult<RevealedBank>, FormData>(revealBankAction, idle as ActionResult<RevealedBank>);
  if (state.ok && state.data) {
    const rows = Object.entries(state.data).filter(([, v]) => v);
    return (
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs capitalize text-amber-800">{k.replaceAll("_", " ")}</dt><dd className="font-mono">{v}</dd></div>
        ))}
        <p className="col-span-2 text-xs text-amber-800">This reveal has been recorded in the audit log.</p>
      </dl>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="doctor_id" value={doctorId} />
      {!state.ok && "error" in state && state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? "Revealing…" : "Reveal full numbers"}</Button>
    </form>
  );
}
