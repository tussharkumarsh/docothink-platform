import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requirePermission } from "@/lib/auth/viewer";
import { getPlatformSettings } from "@/features/appointments/settings";
import { getInvoice } from "@/features/finance/invoice-queries";
import { InvoiceDocument } from "@/features/finance/components/invoice-document";
import { rejectInvoiceAction, updatePayoutAction } from "@/features/admin/actions";
import { RevealBank } from "@/features/admin/components/reveal-bank";
import { PrintButton } from "@/features/prescriptions/components/print-button";
import { formatMoney } from "@/lib/money";

export default async function AdminInvoicePage({ params }: PageProps<"/admin/finance/invoices/[id]">) {
  await requirePermission("finance.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [invoice, settings] = await Promise.all([getInvoice(id), getPlatformSettings()]);
  if (!invoice) notFound();
  const tz = settings.display.admin_timezone;
  const open = ["pending", "under_review", "approved"].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link href="/admin/finance/invoices" className="text-sm text-brand-700 hover:underline">← Invoices</Link>
        <PrintButton />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <InvoiceDocument invoice={invoice} timezone={tz} />
        {open && (
          <div className="space-y-6 no-print">
            {invoice.status !== "approved" ? (
              <Card>
                <CardHeader title="Decision" description="Check the lines and the bank details, then approve." />
                <div className="p-5">
                  <ActionForm action={updatePayoutAction} submitLabel="Save">
                    <input type="hidden" name="payout_id" value={invoice.id} />
                    <Field label="Action" htmlFor="status">
                      <Select id="status" name="status" defaultValue="approved">
                        {invoice.status === "pending" && <option value="under_review">Start review (doctor can no longer withdraw)</option>}
                        <option value="approved">Approve for payment</option>
                      </Select>
                    </Field>
                  </ActionForm>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Mark paid" description={`Transfer ${formatMoney(invoice.amount, invoice.currency)} to the account on the invoice, then record the bank reference.`} />
                <div className="space-y-4 p-5">
                  <RevealBank doctorId={invoice.doctor_id} />
                  <p className="text-xs text-slate-500">
                    Reveal shows the doctor&apos;s current verified account. The invoice shows the account it was raised with; if they differ, the doctor changed details since. Check before paying.
                  </p>
                  <ActionForm action={updatePayoutAction} submitLabel="Mark paid">
                    <input type="hidden" name="payout_id" value={invoice.id} />
                    <input type="hidden" name="status" value="paid" />
                    <Field label="Transaction reference (UTR / wire ref)" htmlFor="reference" required><Input id="reference" name="reference" required maxLength={200} /></Field>
                    <Field label="Method" htmlFor="method"><Input id="method" name="method" placeholder="NEFT, IMPS, Faster Payments, ACH…" maxLength={100} /></Field>
                    <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} maxLength={1000} /></Field>
                  </ActionForm>
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="Reject" description="Releases the consultations so the doctor can invoice them again." />
              <div className="p-5">
                <ActionForm action={rejectInvoiceAction} submitLabel="Reject invoice" variant="danger" confirm="Reject this invoice?">
                  <input type="hidden" name="payout_id" value={invoice.id} />
                  <Field label="Reason (sent to the doctor)" htmlFor="reason" required><Textarea id="reason" name="reason" rows={2} required maxLength={1000} /></Field>
                </ActionForm>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
