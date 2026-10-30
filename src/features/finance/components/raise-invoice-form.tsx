"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Table } from "@/components/ui";
import { SubmitButton } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { submitInvoiceAction } from "../actions";
import { invoiceTotals } from "../invoice";

export type InvoiceableEntry = {
  ledger_entry_id: number;
  appointment_id: string;
  reference: string;
  start_label: string;
  mode: string;
  patient_initials: string;
  currency: string;
  amount: number;
  gross_amount: number | null;
  commission_amount: number | null;
  entry_type: "consultation_earning" | "refund_reversal";
};

/**
 * Consultations are selected per appointment: an appointment brings all of its unsettled entries
 * (earning plus any refund adjustment), exactly as submit_invoice() does.
 */
export function RaiseInvoiceForm(props: { entries: InvoiceableEntry[]; tdsRateBps: number; applyTds: boolean; canSubmit: boolean }) {
  const [state, action] = useActionState<ActionResult, FormData>(submitInvoiceAction, idle);
  const appointments = useMemo(() => {
    const by = new Map<string, InvoiceableEntry[]>();
    for (const e of props.entries) by.set(e.appointment_id, [...(by.get(e.appointment_id) ?? []), e]);
    return [...by.entries()];
  }, [props.entries]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const currency = props.entries[0]?.currency ?? "INR";
  const chosen = props.entries.filter((e) => selected.has(e.appointment_id));
  const totals = invoiceTotals(chosen, props.tdsRateBps, props.applyTds);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = appointments.length > 0 && selected.size === appointments.length;

  return (
    <form action={action} className="space-y-4">
      {!state.ok && "error" in state && <Alert tone="danger">{state.error}</Alert>}
      <Table>
        <thead>
          <tr>
            <th className="w-10">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(appointments.map(([id]) => id)))}
              />
            </th>
            <th>Consultation</th><th>Patient</th><th>Type</th><th className="text-right">Fee</th><th className="text-right">Commission</th><th className="text-right">Your share</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map(([id, rows]) => {
            const earning = rows.find((r) => r.entry_type === "consultation_earning");
            const share = rows.reduce((sum, r) => sum + r.amount, 0);
            return (
              <tr key={id}>
                <td><input type="checkbox" name="appointment_id" value={id} checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Select ${rows[0].reference}`} /></td>
                <td><span className="font-medium text-slate-900">{rows[0].start_label}</span><span className="block text-xs text-slate-500">{rows[0].reference}</span></td>
                <td>{rows[0].patient_initials}</td>
                <td className="capitalize">{rows[0].mode}</td>
                <td className="text-right tabular-nums">{earning?.gross_amount != null ? formatMoney(earning.gross_amount, currency) : "—"}</td>
                <td className="text-right tabular-nums">{earning?.commission_amount != null ? formatMoney(earning.commission_amount, currency) : "—"}</td>
                <td className="text-right tabular-nums">
                  {formatMoney(share, currency)}
                  {rows.some((r) => r.entry_type === "refund_reversal") && <span className="block text-xs text-red-700">incl. refund adjustment</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div><dt className="text-slate-500">Subtotal ({selected.size})</dt><dd className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(totals.gross, currency)}</dd></div>
          {props.applyTds && <div><dt className="text-slate-500">TDS {props.tdsRateBps / 100}%</dt><dd className="text-lg font-semibold tabular-nums text-red-700">−{formatMoney(totals.tds, currency)}</dd></div>}
          <div><dt className="text-slate-500">You receive</dt><dd className="text-lg font-semibold tabular-nums text-emerald-700">{formatMoney(totals.net, currency)}</dd></div>
        </dl>
        <SubmitButton disabled={!props.canSubmit || selected.size === 0 || totals.gross <= 0} pendingText="Submitting…">
          Submit invoice
        </SubmitButton>
      </div>
    </form>
  );
}
