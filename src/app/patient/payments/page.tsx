import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";

export default async function PatientPaymentsPage() {
  const viewer = await requireRole("patient", "/patient/payments");
  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payment_records")
    .select("id, appointment_id, purpose, amount, amount_refunded, currency, status, provider, succeeded_at, created_at, appointments(reference)")
    .order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Payments" description="All charges and refunds. Card details are held by the payment provider, never by Docothink." />
      <Card>
        {!payments?.length ? (
          <EmptyState icon={<CreditCard className="size-6" aria-hidden />} title="No payments yet" />
        ) : (
          <Table>
            <thead><tr><th>Date</th><th>Appointment</th><th>For</th><th>Status</th><th className="text-right">Amount</th><th className="text-right">Refunded</th><th /></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.succeeded_at ?? p.created_at, viewer.timezone, { withZone: false })}</td>
                  <td><Link href={`/patient/appointments/${p.appointment_id}`} className="text-brand-700 hover:underline">{(p.appointments as unknown as { reference: string } | null)?.reference}</Link></td>
                  <td className="capitalize">{p.purpose}{p.provider === "manual" && <Badge tone="warning" className="ml-1">dev simulation</Badge>}</td>
                  <td><Badge tone={p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : "neutral"}>{p.status.replace("_", " ")}</Badge></td>
                  <td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                  <td className="text-right tabular-nums">{p.amount_refunded ? formatMoney(p.amount_refunded, p.currency) : "—"}</td>
                  <td className="text-right">{p.status !== "pending" && p.status !== "failed" && p.status !== "cancelled" && <Link href={`/patient/payments/${p.id}`} className="text-sm text-brand-700 hover:underline">Receipt</Link>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
