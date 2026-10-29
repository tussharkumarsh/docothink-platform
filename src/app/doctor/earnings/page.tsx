import { Wallet } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, Table } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getLedger } from "@/features/finance/queries";
import { monthly, summarise } from "@/features/finance/summary";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time/format";

const ENTRY_LABELS = { consultation_earning: "Consultation", refund_reversal: "Refund adjustment", adjustment: "Adjustment", payout: "Payout" } as const;

export default async function EarningsPage() {
  const viewer = await requireApprovedDoctor();
  const supabase = await createClient();
  const [ledger, { data: payouts }, { data: rules }] = await Promise.all([
    getLedger(),
    supabase.from("doctor_payouts").select("id, amount, currency, status, transaction_reference, payout_method, paid_at, created_at").order("created_at", { ascending: false }),
    supabase.from("commission_rules").select("rate_bps, doctor_id, effective_from").order("effective_from", { ascending: false }),
  ]);
  const summaries = summarise(ledger, payouts ?? []);
  const months = monthly(ledger, viewer.timezone);
  const rate = rules?.find((r) => r.doctor_id === viewer.id) ?? rules?.find((r) => r.doctor_id === null);

  return (
    <>
      <PageHeader
        title="Earnings"
        description={`Current platform commission: ${rate ? rate.rate_bps / 100 : 10}% of each paid consultation. Earnings are credited when a paid consultation is completed.`}
        actions={<ButtonLink href="/api/statements" variant="secondary">Download statement (CSV)</ButtonLink>}
      />
      {summaries.length === 0 ? (
        <Card><EmptyState icon={<Wallet className="size-6" aria-hidden />} title="No earnings yet" description="Completed, paid consultations appear here." /></Card>
      ) : summaries.map((s) => (
        <section key={s.currency} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{s.currency}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Completed consultations" value={s.consultations} />
            <Stat label="Gross consultation value" value={formatMoney(s.gross, s.currency)} />
            <Stat label="Platform commission" value={formatMoney(s.commission, s.currency)} />
            <Stat label="Net earnings" value={formatMoney(s.net, s.currency)} />
            <Stat label="Pending settlement" value={formatMoney(s.pendingSettlement, s.currency)} hint="Not yet in a payout" />
            <Stat label="In review / on hold" value={formatMoney(s.inReview, s.currency)} />
            <Stat label="Approved for payout" value={formatMoney(s.approved, s.currency)} />
            <Stat label="Paid out" value={formatMoney(s.paid, s.currency)} />
          </div>
        </section>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly" />
          <Table>
            <thead><tr><th>Month</th><th>Consultations</th><th className="text-right">Net</th></tr></thead>
            <tbody>{months.map((m) => <tr key={`${m.month}${m.currency}`}><td>{m.month}</td><td>{m.count}</td><td className="text-right tabular-nums">{formatMoney(m.net, m.currency)}</td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Payouts" />
          <Table>
            <thead><tr><th>Created</th><th>Status</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {payouts?.length ? payouts.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.created_at, viewer.timezone)}</td>
                  <td><Badge tone={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : "neutral"}>{p.status.replace("_", " ")}</Badge></td>
                  <td className="text-xs">{p.transaction_reference ?? "—"}{p.paid_at && <span className="block text-slate-500">{formatDate(p.paid_at, viewer.timezone)}</span>}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                </tr>
              )) : <tr><td colSpan={4} className="text-center text-slate-500">No payouts yet.</td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Ledger" description="Every credit and debit. Entries are never edited; corrections appear as new lines." />
        <Table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th className="text-right">Gross</th><th className="text-right">Commission</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            {ledger.slice(0, 200).map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{formatDateTime(e.created_at, viewer.timezone, { withZone: false })}</td>
                <td>{ENTRY_LABELS[e.entry_type]}{e.entry_type !== "payout" && e.in_payout && <Badge className="ml-1">settled</Badge>}</td>
                <td>{e.description}</td>
                <td className="text-right tabular-nums">{e.gross_amount != null ? formatMoney(e.gross_amount, e.currency) : "—"}</td>
                <td className="text-right tabular-nums">{e.commission_amount != null ? formatMoney(e.commission_amount, e.currency) : "—"}</td>
                <td className={`text-right tabular-nums ${e.amount < 0 ? "text-red-700" : ""}`}>{formatMoney(e.amount, e.currency)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
