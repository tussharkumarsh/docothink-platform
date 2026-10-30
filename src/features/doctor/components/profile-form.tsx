import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { CURRENCIES, toMajorString } from "@/lib/money";
import { supportedTimezones } from "@/lib/time/format";
import { updateDoctorProfileAction } from "../actions";

export type DoctorProfileRow = {
  title: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  qualifications: string | null;
  years_experience: number | null;
  languages: string[];
  country: string | null;
  timezone: string;
  currency: string;
  fee_chat: number | null;
  fee_audio: number | null;
  fee_video: number | null;
  registration_number: string | null;
  registration_council: string | null;
  registration_country: string | null;
  education: { degree: string; institution: string; year?: number }[];
  experience: { position: string; organization: string; years?: string }[];
  application_status: string;
};

export function DoctorProfileForm({ doctor }: { doctor: DoctorProfileRow }) {
  const locked = doctor.application_status === "approved" || doctor.application_status === "suspended";
  const zones = supportedTimezones();
  return (
    <ActionForm action={updateDoctorProfileAction} submitLabel="Save profile" className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Public profile</legend>
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:col-span-2">
          <Field label="Title" htmlFor="title"><Input id="title" name="title" defaultValue={doctor.title} /></Field>
          <Field label="Name shown to patients" htmlFor="display_name" required><Input id="display_name" name="display_name" defaultValue={doctor.display_name} required /></Field>
        </div>
        <Field label="Headline" htmlFor="headline" hint="e.g. Consultant Dermatologist"><Input id="headline" name="headline" defaultValue={doctor.headline ?? ""} /></Field>
        <Field label="Qualifications" htmlFor="qualifications" required hint="e.g. MBBS, MD (Dermatology)"><Input id="qualifications" name="qualifications" defaultValue={doctor.qualifications ?? ""} /></Field>
        <Field label="Years of experience" htmlFor="years_experience"><Input id="years_experience" name="years_experience" type="number" min={0} max={80} defaultValue={doctor.years_experience ?? ""} /></Field>
        <Field label="Languages" htmlFor="languages" hint="Comma-separated, e.g. English, Hindi"><Input id="languages" name="languages" defaultValue={doctor.languages.join(", ")} /></Field>
        <Field label="About you" htmlFor="bio" className="sm:col-span-2"><Textarea id="bio" name="bio" rows={5} defaultValue={doctor.bio ?? ""} /></Field>
        <Field label="Education" htmlFor="education" className="sm:col-span-2" hint="One per line: Degree | Institution | Year">
          <Textarea id="education" name="education" rows={3} defaultValue={doctor.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(" | ")).join("\n")} />
        </Field>
        <Field label="Experience" htmlFor="experience" className="sm:col-span-2" hint="One per line: Position | Hospital or clinic | Years">
          <Textarea id="experience" name="experience" rows={3} defaultValue={doctor.experience.map((e) => [e.position, e.organization, e.years].filter(Boolean).join(" | ")).join("\n")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Location, currency & fees</legend>
        <Field label="Country (2-letter)" htmlFor="country"><Input id="country" name="country" maxLength={2} defaultValue={doctor.country ?? ""} /></Field>
        <Field label="Your time zone" htmlFor="timezone" hint="Your availability is entered in this zone.">
          <Select id="timezone" name="timezone" defaultValue={doctor.timezone}>
            {(zones.includes(doctor.timezone) ? zones : [doctor.timezone, ...zones]).map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
        <Field label="Fee currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={doctor.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        {(["chat", "audio", "video"] as const).map((m) => (
          <Field key={m} label={`${m[0].toUpperCase() + m.slice(1)} consultation fee`} htmlFor={`fee_${m}`} hint="Leave empty if you don't offer it.">
            <Input id={`fee_${m}`} name={`fee_${m}`} inputMode="decimal" defaultValue={toMajorString(doctor[`fee_${m}`], doctor.currency)} />
          </Field>
        ))}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Medical registration</legend>
        {locked && <p className="text-sm text-slate-500 sm:col-span-3">Verified details are locked. Contact support to change them.</p>}
        <Field label="Registration number" htmlFor="registration_number" required><Input id="registration_number" name="registration_number" defaultValue={doctor.registration_number ?? ""} disabled={locked} /></Field>
        <Field label="Medical council / board" htmlFor="registration_council"><Input id="registration_council" name="registration_council" defaultValue={doctor.registration_council ?? ""} disabled={locked} /></Field>
        <Field label="Registration country (2-letter)" htmlFor="registration_country" required><Input id="registration_country" name="registration_country" maxLength={2} defaultValue={doctor.registration_country ?? ""} disabled={locked} /></Field>
      </fieldset>
    </ActionForm>
  );
}
