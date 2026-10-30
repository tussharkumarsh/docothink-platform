import Link from "next/link";
import { Wallet } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Stat, Table, buttonClasses } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getLedger } from "@/features/finance/queries";
import { monthly, summarise } from "@/features/finance/summary";
import { RaiseInvoiceForm, type InvoiceableEntry } from "@/features/finance/components/raise-invoice-form";
import { withdrawInvoiceAction } from "@/features/finance/actions";
import { INVOICE_STATUS } from "@/features/finance/invoice";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time/format";

const ENTRY_LABELS = { consultation_earning: "Consultation", refund_reversal: "Refund adjustment", adjustment: "Adjustment", payout: "Payout" } as const;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "raise", label: "Raise invoice" },
  { key: "invoices", label: "Invoices" },
] as const;

export default async function EarningsPage({ searchParams }: PageProps<"/doctor/earnings">) {
  const viewer = await requireApprovedDoctor();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "overview";
  const supabase = await createClient();
  const [ledger, { data: payouts }, { data: rules }] = await Promise.all([
    getLedger(),
    supabase
      .from("doctor_payouts")
      .select("id, amount, currency, status, transaction_reference, payout_method, paid_at, created_at, source, invoice_number, gross_amount, tds_amount, submitted_at")
      .order("created_at", { ascending: false }),
    supabase.from("commission_rules").select("rate_bps, doctor_id, effective_from").order("effective_from", { ascending: false }),
  ]);
  const summaries = summarise(ledger, payouts ?? []);
  const months = monthly(ledger, viewer.timezone);
  const rate = rules?.find((r) => r.doctor_id === viewer.id) ?? rules?.find((r) => r.doctor_id === null);
  const invoices = (payouts ?? []).filter((p) => p.source === "invoice");

  return (
    <>
      <PageHeader
        title="Earnings"
        description={`Current platform commission: ${rate ? rate.rate_bps / 100 : 10}% of each paid consultation. Earnings are credited when a paid consultation is completed.`}
        actions={<a href="/api/statements" download className={buttonClasses("secondary")}>Download statement (CSV)</a>}
      />
      <nav aria-label="Earnings sections" className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/doctor/earnings?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={tab === t.key ? "rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white" : "rounded-full bg-white px-4 py-1.5 text-sm text-slate-700 ring-1 ring-black/5 hover:bg-slate-100"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "raise" && <RaiseInvoiceTab doctorId={viewer.id} timezone={viewer.timezone} />}

      {tab === "invoices" && (
        <Card>
          <CardHeader title="Invoices" description="Withdraw an invoice while it is still Submitted. Rejected and withdrawn consultations can be invoiced again." />
          <Table>
            <thead><tr><th>Invoice</th><th>Submitted</th><th>Status</th><th className="text-right">Subtotal</th><th className="text-right">TDS</th><th className="text-right">Net</th><th /></tr></thead>
            <tbody>
              {invoices.length ? invoices.map((p) => {
                const st = INVOICE_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                return (
                  <tr key={p.id}>
                    <td><Link href={`/doctor/invoices/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.invoice_number}</Link></td>
                    <td>{p.submitted_at ? formatDate(p.submitted_at, viewer.timezone) : "—"}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="text-right tabular-nums">{formatMoney(p.gross_amount ?? p.amount, p.currency)}</td>
                    <td className="text-right tabular-nums">{p.tds_amount ? formatMoney(p.tds_amount, p.currency) : "—"}</td>
                    <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className="text-right">
                      {p.status === "pending" && (
                        <form action={withdrawInvoiceAction}>
                          <input type="hidden" name="payout_id" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost">Withdraw</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7} className="text-center text-slate-500">No invoices yet. <Link href="/doctor/earnings?tab=raise" className="text-brand-700 hover:underline">Raise one</Link>.</td></tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "overview" && (
        <>
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
                <Stat label="Pending settlement" value={formatMoney(s.pendingSettlement, s.currency)} hint="Not yet in an invoice or payout" />
                <Stat label="In review / on hold" value={formatMoney(s.inReview, s.currency)} />
                <Stat label="Approved for payout" value={formatMoney(s.approved, s.currency)} />
                <Stat label="Paid out" value={formatMoney(s.paid, s.currency)} />
                {s.tdsWithheld > 0 && <Stat label="TDS withheld" value={formatMoney(s.tdsWithheld, s.currency)} hint="Deducted from paid invoices for the tax authority" />}
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
                      <td>{formatDate(p.created_at, viewer.timezone)}{p.invoice_number && <span className="block text-xs text-slate-500">{p.invoice_number}</span>}</td>
                      <td><Badge tone={(INVOICE_STATUS[p.status] ?? { tone: "neutral" }).tone}>{p.source === "invoice" ? (INVOICE_STATUS[p.status]?.label ?? p.status) : p.status.replace("_", " ")}</Badge></td>
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
      )}
    </>
  );
}

/** Lists unsettled consultations and builds the invoice. Submitting needs verified bank & KYC details. */
async function RaiseInvoiceTab({ doctorId, timezone }: { doctorId: string; timezone: string }) {
  const supabase = await createClient();
  const [{ data: entries, error }, { data: kyc }, { data: tdsSetting }] = await Promise.all([
    supabase.rpc("invoiceable_entries"),
    supabase.from("doctor_private_details").select("kyc_status, bank_country").eq("doctor_id", doctorId).maybeSingle(),
    supabase.from("platform_settings").select("value").eq("key", "tds").maybeSingle(),
  ]);
  const tds = (tdsSetting?.value ?? {}) as { rate_bps?: number; countries?: string[] };
  const verified = kyc?.kyc_status === "verified";
  const applyTds = Boolean(kyc?.bank_country && tds.countries?.includes(kyc.bank_country));
  const rows: InvoiceableEntry[] = ((entries ?? []) as (Omit<InvoiceableEntry, "start_label"> & { start_at: string })[]).map((e) => ({
    ...e,
    start_label: formatDateTime(e.start_at, timezone, { withZone: false }),
  }));
  return (
    <Card>
      <CardHeader title="Raise a settlement invoice" description="Select completed consultations to be paid to your verified bank account. Each consultation can be invoiced once." />
      <div className="space-y-4 p-5">
        {!verified && (
          <Alert tone="warning" title="Bank details not verified yet">
            Invoices are paid only to a verified bank account. <Link href="/doctor/profile?tab=bank" className="underline">Add or check your bank &amp; tax details</Link>.
          </Alert>
        )}
        {error ? (
          <Alert tone="danger">Could not load your consultations.</Alert>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="Nothing to invoice" description="Completed consultations that are not in an invoice or payout appear here." />
        ) : (
          <RaiseInvoiceForm entries={rows} tdsRateBps={tds.rate_bps ?? 0} applyTds={applyTds} canSubmit={verified} />
        )}
      </div>
    </Card>
  );
}
