import Link from "next/link";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Stat, Table } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getLedger } from "@/features/finance/queries";
import { getPlatformSettings } from "@/features/appointments/settings";
import { addAdjustmentAction, createSettlementAction, setCommissionAction, updatePayoutAction } from "@/features/admin/actions";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time/format";

const NEXT_STATUSES: Record<string, string[]> = {
  pending: ["under_review", "approved", "on_hold", "failed"],
  under_review: ["approved", "on_hold", "failed"],
  on_hold: ["under_review", "approved", "failed"],
  approved: ["processing", "paid", "on_hold"],
  processing: ["paid", "failed"],
};

export default async function FinancePage() {
  await requirePermission("finance.manage");
  const supabase = await createClient();
  const settings = await getPlatformSettings();
  const tz = settings.display.admin_timezone;
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const [ledger, { data: payouts }, { data: payments }, { data: refunds }, { data: doctors }, { data: platformRule }] = await Promise.all([
    getLedger({ limit: 5000 }),
    supabase.from("doctor_payouts").select("id, doctor_id, amount, currency, status, transaction_reference, payout_method, notes, created_at, paid_at, payout_batches(settlement_date), doctor_profiles(title, display_name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("payment_records").select("id, appointment_id, purpose, provider, amount, currency, status, succeeded_at, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("refunds").select("id, appointment_id, amount, currency, status, reason, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("doctor_profiles").select("user_id, title, display_name").eq("application_status", "approved").order("display_name"),
    supabase.from("commission_rules").select("rate_bps, effective_from").is("doctor_id", null).order("effective_from", { ascending: false }).limit(1),
  ]);

  const byCurrency = new Map<string, { gross: number; commission: number; refundsReversed: number; unsettled: number }>();
  for (const e of ledger) {
    if (e.entry_type === "payout") continue;
    const r = byCurrency.get(e.currency) ?? { gross: 0, commission: 0, refundsReversed: 0, unsettled: 0 };
    r.gross += e.gross_amount ?? 0;
    r.commission += e.commission_amount ?? 0;
    if (e.entry_type === "refund_reversal") r.refundsReversed += e.amount;
    if (!e.in_payout) r.unsettled += e.amount;
    byCurrency.set(e.currency, r);
  }

  return (
    <>
      <PageHeader title="Finance & payouts" description="Ledger-based. Payout records never move money by themselves: transfers happen outside the platform and are recorded here with a reference." actions={<Link href="/api/statements" className="text-sm text-brand-700 hover:underline">Export full ledger (CSV)</Link>} />

      {[...byCurrency].map(([currency, r]) => (
        <div key={currency} className="mb-4 grid gap-4 sm:grid-cols-4">
          <Stat label={`${currency} gross (earned)`} value={formatMoney(r.gross, currency)} />
          <Stat label="Commission revenue" value={formatMoney(r.commission, currency)} />
          <Stat label="Refund reversals" value={formatMoney(r.refundsReversed, currency)} />
          <Stat label="Unsettled doctor balance" value={formatMoney(r.unsettled, currency)} />
        </div>
      ))}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <p className="mb-3 font-medium text-slate-900">Create settlement batch</p>
          <ActionForm action={createSettlementAction} submitLabel="Create / open batch">
            <input type="hidden" name="timezone" value={tz} />
            <Field label="Settlement date" htmlFor="settlement_date"><Input id="settlement_date" name="settlement_date" type="date" defaultValue={todayLocal} required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Currency" htmlFor="currency"><Select id="currency" name="currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label={`Cut-off (${tz})`} htmlFor="cutoff_time"><Input id="cutoff_time" name="cutoff_time" type="time" defaultValue="18:00" required /></Field>
            </div>
            <p className="text-xs text-slate-500">Includes every unsettled ledger entry up to the cut-off. Idempotent per date and currency.</p>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <p className="mb-3 font-medium text-slate-900">Ledger adjustment</p>
          <ActionForm action={addAdjustmentAction} submitLabel="Record adjustment" confirm="Record this adjustment? Ledger entries can't be edited later.">
            <Field label="Doctor" htmlFor="adj_doctor"><Select id="adj_doctor" name="doctor_id" required>{doctors?.map((d) => <option key={d.user_id} value={d.user_id}>{d.title} {d.display_name}</option>)}</Select></Field>
            <div className="grid grid-cols-3 gap-2">
              <Select name="direction" aria-label="Direction"><option value="credit">Credit</option><option value="debit">Debit</option></Select>
              <Select name="currency" aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
              <Input name="amount" inputMode="decimal" placeholder="Amount" aria-label="Amount" required />
            </div>
            <Field label="Description" htmlFor="adj_desc"><Input id="adj_desc" name="description" required /></Field>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-medium text-slate-900">Default commission</p>
          <p className="mb-3 text-sm text-slate-600">Currently {platformRule?.[0] ? platformRule[0].rate_bps / 100 : 10}%. Applies to new bookings; existing bookings keep their snapshot.</p>
          <ActionForm action={setCommissionAction} submitLabel="Update default" confirm="Change the platform commission for all new bookings?">
            <Field label="Commission %" htmlFor="def_pct"><Input id="def_pct" name="percent" type="number" step="0.01" min={0} max={100} required /></Field>
            <Field label="Note" htmlFor="def_note"><Input id="def_note" name="note" /></Field>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Doctor payouts" />
        <Table>
          <thead><tr><th>Doctor</th><th>Batch</th><th className="text-right">Amount</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>
            {payouts?.length ? payouts.map((p) => {
              const doc = p.doctor_profiles as unknown as { title: string; display_name: string } | null;
              const next = NEXT_STATUSES[p.status] ?? [];
              return (
                <tr key={p.id} className="align-top">
                  <td>{doc ? `${doc.title} ${doc.display_name}` : p.doctor_id}<Link href={`/api/statements?doctor=${p.doctor_id}`} className="block text-xs text-brand-700 hover:underline">Statement</Link></td>
                  <td>{formatDate((p.payout_batches as unknown as { settlement_date: string }).settlement_date)}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                  <td><Badge tone={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : p.status === "on_hold" ? "warning" : "neutral"}>{p.status.replace("_", " ")}</Badge>{p.transaction_reference && <span className="block font-mono text-xs">{p.transaction_reference}</span>}</td>
                  <td>
                    {next.length > 0 ? (
                      <ActionForm action={updatePayoutAction} submitLabel="Update" className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="payout_id" value={p.id} />
                        <Select name="status" aria-label="New status" className="w-36">{next.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select>
                        <Input name="reference" placeholder="Transaction ref (required for paid)" aria-label="Transaction reference" className="w-56" />
                        <Input name="method" placeholder="Method" aria-label="Method" className="w-28" />
                      </ActionForm>
                    ) : <span className="text-xs text-slate-500">{p.paid_at ? `Paid ${formatDateTime(p.paid_at, tz, { withZone: false })}` : "Closed"}</span>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={5} className="text-center text-slate-500">No payouts yet. Create a settlement batch.</td></tr>}
          </tbody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent payments" />
          <Table>
            <thead><tr><th>Date</th><th>For</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{payments?.map((p) => <tr key={p.id}><td>{formatDateTime(p.succeeded_at ?? p.created_at, tz, { withZone: false })}</td><td><Link href={`/admin/appointments/${p.appointment_id}`} className="capitalize text-brand-700 hover:underline">{p.purpose}</Link>{p.provider === "manual" && <Badge tone="warning" className="ml-1">dev</Badge>}</td><td>{p.status}</td><td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Recent refunds" />
          <Table>
            <thead><tr><th>Date</th><th>Reason</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{refunds?.map((r) => <tr key={r.id}><td>{formatDateTime(r.created_at, tz, { withZone: false })}</td><td><Link href={`/admin/appointments/${r.appointment_id}`} className="text-brand-700 hover:underline">{r.reason}</Link></td><td><Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Badge></td><td className="text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td></tr>)}</tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
