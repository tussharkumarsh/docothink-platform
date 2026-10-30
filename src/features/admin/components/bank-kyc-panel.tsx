import { Badge, Card, CardHeader, Field, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { formatDateTime } from "@/lib/time/format";
import { KYC_LABELS } from "@/features/doctor/components/bank-form";
import { reviewKycAction } from "../actions";
import { RevealBank } from "./reveal-bank";

export type MaskedBank = {
  doctor_id: string;
  address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null;
  account_holder_name: string | null; bank_name: string | null; bank_country: string | null;
  account_masked: string | null; ifsc: string | null; sort_code: string | null; routing_masked: string | null; account_type: string | null;
  pan_masked: string | null; gstin: string | null; tax_id_masked: string | null;
  kyc_status: string; kyc_note: string | null; submitted_at: string | null; verified_at: string | null;
};

/** Finance-only. Values are masked (from admin_doctor_bank_masked); full numbers need an audited reveal. */
export function BankKycPanel({ doctorId, bank, timezone }: { doctorId: string; bank: MaskedBank | null; timezone: string }) {
  const status = KYC_LABELS[bank?.kyc_status ?? "not_submitted"];
  const rows: [string, string | null | undefined][] = bank
    ? [
        ["Account holder", bank.account_holder_name], ["Bank", bank.bank_name], ["Bank country", bank.bank_country],
        ["Account number", bank.account_masked], ["IFSC", bank.ifsc], ["Sort code", bank.sort_code],
        ["Routing number", bank.routing_masked], ["Account type", bank.account_type],
        ["PAN", bank.pan_masked], ["GSTIN", bank.gstin], ["SSN / EIN", bank.tax_id_masked],
        ["Address", [bank.address_line1, bank.address_line2, bank.city, bank.region, bank.postal_code, bank.country].filter(Boolean).join(", ") || null],
      ]
    : [];
  return (
    <Card>
      <CardHeader
        title="Bank & KYC"
        description="Check the details against the bank proof in Verification documents before verifying."
        action={<Badge tone={status.tone}>{status.text}</Badge>}
      />
      <div className="space-y-4 p-5 text-sm">
        {!bank ? (
          <p className="text-slate-500">The doctor hasn&apos;t submitted bank or address details yet.</p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              {rows.filter(([, v]) => v).map(([label, value]) => (
                <div key={label}><dt className="text-slate-500">{label}</dt><dd className="text-slate-900">{value}</dd></div>
              ))}
            </dl>
            {bank.submitted_at && <p className="text-xs text-slate-500">Submitted {formatDateTime(bank.submitted_at, timezone)}{bank.verified_at ? ` · verified ${formatDateTime(bank.verified_at, timezone)}` : ""}</p>}
            {bank.kyc_note && <p className="rounded-xl bg-red-50 p-3 text-red-900">Requested: {bank.kyc_note}</p>}
            {bank.account_masked && <RevealBank doctorId={doctorId} />}
            {bank.kyc_status === "pending" && (
              <ActionForm action={reviewKycAction} submitLabel="Save decision" className="space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="doctor_id" value={doctorId} />
                <Field label="Decision" htmlFor="decision">
                  <Select id="decision" name="decision" defaultValue="verify">
                    <option value="verify">Verify: details match the bank proof</option>
                    <option value="request_changes">Request changes</option>
                  </Select>
                </Field>
                <Field label="Note to the doctor" htmlFor="kyc_note_input" hint="Required when requesting changes.">
                  <Textarea id="kyc_note_input" name="note" rows={2} maxLength={1000} />
                </Field>
              </ActionForm>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
