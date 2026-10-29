import { Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "@/features/account/components/account-form";
import { updatePatientDetailsAction } from "@/features/account/actions";
import { supportedTimezones } from "@/lib/time/format";

export default async function PatientProfilePage() {
  const viewer = await requireRole("patient", "/patient/profile");
  const supabase = await createClient();
  const [{ data: profile }, { data: p }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone, timezone, country, preferred_language").eq("id", viewer.id).single(),
    supabase.from("patient_profiles").select("*").eq("user_id", viewer.id).single(),
  ]);
  return (
    <>
      <PageHeader title="Personal details" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <div className="p-5">{profile && <AccountForm profile={profile} timezones={supportedTimezones()} />}</div>
        </Card>
        <Card>
          <CardHeader title="Personal information & emergency contact" />
          <div className="p-5">
            <ActionForm action={updatePatientDetailsAction} submitLabel="Save personal details" className="grid gap-4 sm:grid-cols-2">
              <Field label="Date of birth" htmlFor="date_of_birth"><Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={p?.date_of_birth ?? ""} /></Field>
              <Field label="Sex" htmlFor="sex">
                <Select id="sex" name="sex" defaultValue={p?.sex ?? ""}>
                  <option value="">Prefer to choose later</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="intersex">Intersex</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </Select>
              </Field>
              <Field label="Address line 1" htmlFor="address_line1"><Input id="address_line1" name="address_line1" defaultValue={p?.address_line1 ?? ""} /></Field>
              <Field label="Address line 2" htmlFor="address_line2"><Input id="address_line2" name="address_line2" defaultValue={p?.address_line2 ?? ""} /></Field>
              <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={p?.city ?? ""} /></Field>
              <Field label="State / region" htmlFor="region"><Input id="region" name="region" defaultValue={p?.region ?? ""} /></Field>
              <Field label="Postal code" htmlFor="postal_code"><Input id="postal_code" name="postal_code" defaultValue={p?.postal_code ?? ""} /></Field>
              <Field label="Country (2-letter code)" htmlFor="pcountry"><Input id="pcountry" name="country" defaultValue={p?.country ?? ""} maxLength={2} /></Field>
              <Field label="Emergency contact name" htmlFor="emergency_contact_name"><Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={p?.emergency_contact_name ?? ""} /></Field>
              <Field label="Relationship" htmlFor="emergency_contact_relationship"><Input id="emergency_contact_relationship" name="emergency_contact_relationship" defaultValue={p?.emergency_contact_relationship ?? ""} /></Field>
              <Field label="Emergency contact phone" htmlFor="emergency_contact_phone"><Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={p?.emergency_contact_phone ?? ""} /></Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
