"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { idle, type ActionResult } from "@/lib/errors";
import { revealInvoiceBankAction, type RevealedInvoiceBank } from "../actions";

const LABELS: Record<keyof RevealedInvoiceBank, string> = {
  account_holder_name: "Account holder", bank_name: "Bank", account_number: "Account number", ifsc: "IFSC",
  sort_code: "Sort code", routing_number: "Routing number", account_type: "Account type", pan: "PAN", tax_id: "SSN / EIN",
};

/** Pay-to details from the invoice's own snapshot, fetched on demand and audit-logged. */
export function RevealInvoiceBank({ payoutId }: { payoutId: string }) {
  const [state, action, pending] = useActionState<ActionResult<RevealedInvoiceBank>, FormData>(revealInvoiceBankAction, idle as ActionResult<RevealedInvoiceBank>);
  if (state.ok && state.data) {
    const d = state.data;
    return (
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        {(Object.keys(LABELS) as (keyof RevealedInvoiceBank)[]).filter((k) => d[k]).map((k) => (
          <div key={k}><dt className="text-xs text-amber-800">{LABELS[k]}</dt><dd className="font-mono">{d[k]}</dd></div>
        ))}
        <p className="col-span-2 text-xs text-amber-800">Pay this account (from the invoice). This reveal has been recorded in the audit log.</p>
      </dl>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="payout_id" value={payoutId} />
      {!state.ok && "error" in state && state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? "Revealing…" : "Reveal account to pay"}</Button>
    </form>
  );
}
