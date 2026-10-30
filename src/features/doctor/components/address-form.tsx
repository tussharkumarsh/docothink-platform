import { Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { saveAddressAction } from "../actions";

export type PrivateDetailsRow = Record<string, string | null> & { kyc_status: string; kyc_note: string | null };

export function AddressForm({ details }: { details: PrivateDetailsRow | null }) {
  const v = (k: string) => details?.[k] ?? "";
  return (
    <ActionForm action={saveAddressAction} submitLabel="Save address">
      <p className="text-sm text-slate-500">Your practice or correspondence address. Used for invoices; never shown to patients.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1" htmlFor="address_line1" required className="sm:col-span-2"><Input id="address_line1" name="address_line1" maxLength={200} defaultValue={v("address_line1")} /></Field>
        <Field label="Address line 2" htmlFor="address_line2" className="sm:col-span-2"><Input id="address_line2" name="address_line2" maxLength={200} defaultValue={v("address_line2")} /></Field>
        <Field label="City" htmlFor="city" required><Input id="city" name="city" maxLength={100} defaultValue={v("city")} /></Field>
        <Field label="State / region" htmlFor="region"><Input id="region" name="region" maxLength={100} defaultValue={v("region")} /></Field>
        <Field label="Postal code" htmlFor="postal_code" required><Input id="postal_code" name="postal_code" maxLength={20} defaultValue={v("postal_code")} /></Field>
        <Field label="Country (2-letter)" htmlFor="country" required><Input id="country" name="country" maxLength={2} defaultValue={v("country")} placeholder="IN" /></Field>
      </div>
    </ActionForm>
  );
}
