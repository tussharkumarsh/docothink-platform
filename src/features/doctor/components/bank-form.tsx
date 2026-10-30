import Link from "next/link";
import { Alert, Badge, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { saveBankDetailsAction } from "../actions";
import { BANK_COUNTRIES, type BankCountry } from "../kyc";
import type { PrivateDetailsRow } from "./address-form";

export const KYC_LABELS: Record<string, { text: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  not_submitted: { text: "Not submitted", tone: "neutral" },
  pending: { text: "Awaiting verification", tone: "warning" },
  verified: { text: "Verified", tone: "success" },
  changes_requested: { text: "Changes requested", tone: "danger" },
};
const COUNTRY_NAMES: Record<BankCountry, string> = { IN: "India", GB: "United Kingdom", US: "United States" };

/** Country is chosen with links (no client JS); only that country's fields are shown and submitted. */
export function BankForm({ details, country }: { details: PrivateDetailsRow | null; country: BankCountry }) {
  const status = KYC_LABELS[details?.kyc_status ?? "not_submitted"];
  const v = (k: string) => (details?.bank_country === country ? (details?.[k] ?? "") : "");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">Status</span>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      {details?.kyc_status === "changes_requested" && details.kyc_note && (
        <Alert tone="danger" title="Our team asked for changes">{details.kyc_note}</Alert>
      )}
      {details?.kyc_status === "verified" && (
        <Alert tone="info">Saving new bank or tax details sends them for re-verification. Invoices are paused until they&apos;re verified.</Alert>
      )}
      <nav aria-label="Bank country" className="flex flex-wrap gap-1.5">
        {BANK_COUNTRIES.map((c) => (
          <Link
            key={c}
            href={`/doctor/profile?tab=bank&country=${c}`}
            aria-current={c === country ? "true" : undefined}
            className={c === country ? "rounded-full bg-slate-900 px-3 py-1 text-[13px] font-medium text-white" : "rounded-full bg-slate-100 px-3 py-1 text-[13px] text-slate-700 hover:bg-slate-200/70"}
          >
            {COUNTRY_NAMES[c]}
          </Link>
        ))}
      </nav>
      <ActionForm action={saveBankDetailsAction} submitLabel="Save and send for verification">
        <input type="hidden" name="bank_country" value={country} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name" htmlFor="account_holder_name" required><Input id="account_holder_name" name="account_holder_name" maxLength={200} defaultValue={v("account_holder_name")} /></Field>
          <Field label="Bank name" htmlFor="bank_name" required><Input id="bank_name" name="bank_name" maxLength={200} defaultValue={v("bank_name")} /></Field>
          <Field
            label="Account number"
            htmlFor="account_number"
            required
            hint={country === "IN" ? "9–18 digits" : country === "GB" ? "8 digits" : "4–17 digits"}
          >
            <Input id="account_number" name="account_number" inputMode="numeric" autoComplete="off" defaultValue={v("account_number")} />
          </Field>
          {country === "IN" && (
            <>
              <Field label="IFSC" htmlFor="ifsc" required hint="e.g. SBIN0001234"><Input id="ifsc" name="ifsc" maxLength={11} defaultValue={v("ifsc")} /></Field>
              <Field label="PAN" htmlFor="pan" required hint="Needed for TDS on professional fees, e.g. ABCDE1234F"><Input id="pan" name="pan" maxLength={10} autoComplete="off" defaultValue={v("pan")} /></Field>
              <Field label="GSTIN (optional)" htmlFor="gstin" hint="Only if you're GST-registered"><Input id="gstin" name="gstin" maxLength={15} defaultValue={v("gstin")} /></Field>
            </>
          )}
          {country === "GB" && (
            <Field label="Sort code" htmlFor="sort_code" required hint="6 digits, e.g. 12-34-56"><Input id="sort_code" name="sort_code" inputMode="numeric" maxLength={8} defaultValue={v("sort_code")} /></Field>
          )}
          {country === "US" && (
            <>
              <Field label="Routing number" htmlFor="routing_number" required hint="9 digits"><Input id="routing_number" name="routing_number" inputMode="numeric" maxLength={9} defaultValue={v("routing_number")} /></Field>
              <Field label="Account type" htmlFor="account_type" required>
                <Select id="account_type" name="account_type" defaultValue={v("account_type") || "checking"}>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </Select>
              </Field>
              <Field label="SSN or EIN" htmlFor="tax_id" required hint="9 digits, for 1099 reporting"><Input id="tax_id" name="tax_id" inputMode="numeric" autoComplete="off" maxLength={11} defaultValue={v("tax_id")} /></Field>
            </>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
