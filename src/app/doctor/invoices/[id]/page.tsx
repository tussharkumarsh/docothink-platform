import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { getInvoice } from "@/features/finance/invoice-queries";
import { InvoiceDocument } from "@/features/finance/components/invoice-document";
import { withdrawInvoiceAction } from "@/features/finance/actions";
import { PrintButton } from "@/features/prescriptions/components/print-button";

export default async function DoctorInvoicePage({ params }: PageProps<"/doctor/invoices/[id]">) {
  const viewer = await requireApprovedDoctor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const invoice = await getInvoice(id);
  if (!invoice || invoice.doctor_id !== viewer.id) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link href="/doctor/earnings?tab=invoices" className="text-sm text-brand-700 hover:underline">← All invoices</Link>
        <div className="flex gap-2">
          {invoice.status === "pending" && (
            <form action={withdrawInvoiceAction}>
              <input type="hidden" name="payout_id" value={invoice.id} />
              <Button type="submit" variant="ghost">Withdraw</Button>
            </form>
          )}
          <PrintButton label="Print / save as PDF" />
        </div>
      </div>
      <InvoiceDocument invoice={invoice} timezone={viewer.timezone} />
    </div>
  );
}
