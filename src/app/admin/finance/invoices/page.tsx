import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { INVOICE_STATUS } from "@/features/finance/invoice";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time/format";

const FILTERS = [
  ["open", "Waiting for action"],
  ["pending", "Submitted"],
  ["under_review", "Under review"],
  ["approved", "Approved (to pay)"],
  ["paid", "Paid"],
  ["failed", "Rejected"],
  ["cancelled", "Withdrawn"],
  ["all", "All"],
] as const;

export default async function AdminInvoicesPage({ searchParams }: PageProps<"/admin/finance/invoices">) {
  await requirePermission("finance.manage");
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.status) ? String(sp.status) : "open";
  const supabase = await createClient();
  let query = supabase
    .from("doctor_payouts")
    .select("id, invoice_number, status, currency, amount, gross_amount, tds_amount, submitted_at, paid_at, doctor_profiles(title, display_name)")
    .eq("source", "invoice")
    .order("submitted_at", { ascending: filter === "open" || filter === "pending" })
    .limit(300);
  if (filter === "open") query = query.in("status", ["pending", "under_review", "approved"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const [{ data }, settings] = await Promise.all([query, getPlatformSettings()]);
  const tz = settings.display.admin_timezone;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Doctor settlement invoices. Approve, transfer the net amount from the company account, then mark paid with the bank reference."
        actions={<Link href="/admin/finance" className="text-sm text-brand-700 hover:underline">← Finance</Link>}
      />
      <form className="mb-4 flex gap-2">
        <Select name="status" defaultValue={filter} aria-label="Status" className="max-w-xs">
          {FILTERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        {!data?.length ? (
          <EmptyState icon={<FileText className="size-6" aria-hidden />} title="No invoices here" />
        ) : (
          <Table>
            <thead><tr><th>Invoice</th><th>Doctor</th><th>Submitted</th><th>Status</th><th className="text-right">Subtotal</th><th className="text-right">TDS</th><th className="text-right">Net to pay</th></tr></thead>
            <tbody>
              {data.map((p) => {
                const st = INVOICE_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                const d = p.doctor_profiles as unknown as { title: string; display_name: string } | null;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/admin/finance/invoices/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.invoice_number}</Link></td>
                    <td>{d ? `${d.title} ${d.display_name}` : "—"}</td>
                    <td>{p.submitted_at ? formatDate(p.submitted_at, tz) : "—"}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="text-right tabular-nums">{formatMoney(p.gross_amount ?? p.amount, p.currency)}</td>
                    <td className="text-right tabular-nums">{p.tds_amount ? formatMoney(p.tds_amount, p.currency) : "—"}</td>
                    <td className="text-right font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
