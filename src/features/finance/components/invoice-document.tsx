import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time/format";
import { INVOICE_STATUS } from "../invoice";
import type { InvoiceData } from "../invoice-queries";

/** "Emily Carter" → "E. C." — invoices never carry patients' full names. */
function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Patient";
  return words.length === 1 ? `${words[0][0].toUpperCase()}.` : `${words[0][0].toUpperCase()}. ${words[words.length - 1][0].toUpperCase()}.`;
}

/** Printable settlement invoice, shared by the doctor and admin views. Bank and tax numbers are masked. */
export function InvoiceDocument({ invoice, timezone }: { invoice: InvoiceData; timezone: string }) {
  const st = INVOICE_STATUS[invoice.status] ?? { label: invoice.status, tone: "neutral" as const };
  const b = invoice.bank;
  const address = [b.address_line1, b.address_line2, b.city, b.region, b.postal_code, b.country].filter(Boolean).join(", ");
  const billing = invoice.billing;
  const money = (v: number) => formatMoney(v, invoice.currency);

  return (
    <Card className="p-8 print:p-0 print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Settlement invoice</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{invoice.invoice_number}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {invoice.submitted_at && <>Submitted {formatDate(invoice.submitted_at, timezone)}</>}
            {invoice.paid_at && <> · Paid {formatDate(invoice.paid_at, timezone)}</>}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </header>

      <div className="grid gap-6 border-b border-slate-200 py-6 text-sm sm:grid-cols-2">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</h2>
          <p className="mt-2 font-medium text-slate-900">{invoice.doctor ? `${invoice.doctor.title} ${invoice.doctor.display_name}` : "Doctor"}</p>
          {address && <p className="text-slate-600">{address}</p>}
          {invoice.doctor?.registration_number && <p className="text-slate-600">Reg. {invoice.doctor.registration_number}{invoice.doctor.registration_council ? `, ${invoice.doctor.registration_council}` : ""}</p>}
          {b.pan_masked && <p className="text-slate-600">PAN {b.pan_masked}</p>}
          {b.gstin && <p className="text-slate-600">GSTIN {b.gstin}</p>}
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</h2>
          {billing.company_name ? (
            <>
              <p className="mt-2 font-medium text-slate-900">{billing.company_name}</p>
              {billing.address && <p className="whitespace-pre-line text-slate-600">{billing.address}</p>}
              {billing.gstin && <p className="text-slate-600">GSTIN {billing.gstin}</p>}
              {billing.pan && <p className="text-slate-600">PAN {billing.pan}</p>}
              {billing.email && <p className="text-slate-600">{billing.email}</p>}
            </>
          ) : (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">Company billing details are not set yet (Admin → Platform settings).</p>
          )}
        </section>
      </div>

      {invoice.lines.length > 0 ? (
        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-[13px] text-slate-500">
            <tr><th className="py-2 font-medium">Date</th><th className="font-medium">Consultation</th><th className="font-medium">Patient</th><th className="text-right font-medium">Fee</th><th className="text-right font-medium">Commission</th><th className="text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((l) => (
              <tr key={l.ledger_entry_id}>
                <td className="py-2">{l.start_at ? formatDate(l.start_at, timezone) : "—"}</td>
                <td>{l.reference}<span className="ml-1 capitalize text-slate-500">{l.entry_type === "refund_reversal" ? "· refund adjustment" : l.mode ? `· ${l.mode}` : ""}</span></td>
                <td>{initials(l.patient_name)}</td>
                <td className="text-right tabular-nums">{l.gross_amount != null ? money(l.gross_amount) : "—"}</td>
                <td className="text-right tabular-nums">{l.commission_amount != null ? money(l.commission_amount) : "—"}</td>
                <td className={`text-right tabular-nums ${l.amount < 0 ? "text-red-700" : ""}`}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-6 text-sm text-slate-500">The consultations on this invoice were released when it was {invoice.status === "failed" ? "rejected" : "withdrawn"} and can be invoiced again.</p>
      )}

      <dl className="ml-auto mt-6 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd className="tabular-nums">{money(invoice.gross_amount)}</dd></div>
        {invoice.tds_amount > 0 && (
          <div className="flex justify-between"><dt className="text-slate-600">TDS {invoice.tds_rate_bps / 100}% (Sec. 194J)</dt><dd className="tabular-nums text-red-700">−{money(invoice.tds_amount)}</dd></div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold"><dt>Net payable</dt><dd className="tabular-nums">{money(invoice.amount)}</dd></div>
      </dl>

      <section className="mt-8 rounded-xl bg-slate-50 p-4 text-sm print:bg-transparent print:p-0">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</h2>
        <p className="mt-2 text-slate-700">
          {b.account_holder_name ?? "—"} · {b.bank_name ?? "—"} · Account {b.account_masked ?? "—"}
          {b.ifsc ? ` · IFSC ${b.ifsc}` : ""}{b.sort_code ? ` · Sort code ${b.sort_code}` : ""}{b.routing_masked ? ` · Routing ${b.routing_masked}` : ""}
        </p>
        {invoice.status === "paid" && invoice.transaction_reference && (
          <p className="mt-1 font-medium text-emerald-800">Paid{invoice.payout_method ? ` by ${invoice.payout_method}` : ""} · Reference {invoice.transaction_reference}</p>
        )}
        {invoice.status === "failed" && invoice.rejection_reason && <p className="mt-1 text-red-800">Rejected: {invoice.rejection_reason}</p>}
      </section>
    </Card>
  );
}
