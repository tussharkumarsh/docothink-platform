"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { updateAccountAction } from "../actions";

export function AccountForm({
  profile,
  timezones,
}: {
  profile: { full_name: string; email: string; phone: string | null; timezone: string; country: string | null; preferred_language: string };
  timezones: string[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(updateAccountAction, idle);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <Field label="Full name" htmlFor="full_name" error={fieldError(state, "full_name")}><Input id="full_name" name="full_name" defaultValue={profile.full_name} required /></Field>
      <Field label="Email (username)" htmlFor="email" hint="Contact support to change your sign-in email."><Input id="email" value={profile.email} disabled readOnly /></Field>
      <Field label="Phone" htmlFor="phone" error={fieldError(state, "phone")}><Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} /></Field>
      <Field label="Country (2-letter code)" htmlFor="country" error={fieldError(state, "country")}><Input id="country" name="country" defaultValue={profile.country ?? ""} maxLength={2} /></Field>
      <Field label="Time zone" htmlFor="timezone" error={fieldError(state, "timezone")} hint="All appointment times are shown in this zone.">
        <Select id="timezone" name="timezone" defaultValue={profile.timezone}>
          {(timezones.includes(profile.timezone) ? timezones : [profile.timezone, ...timezones]).map((z) => <option key={z}>{z}</option>)}
        </Select>
      </Field>
      <Field label="Preferred language" htmlFor="preferred_language">
        <Select id="preferred_language" name="preferred_language" defaultValue={profile.preferred_language}>
          {[["en", "English"], ["hi", "Hindi"], ["es", "Spanish"], ["bn", "Bengali"], ["ta", "Tamil"], ["ur", "Urdu"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2"><SubmitButton pendingText="Saving…">Save account details</SubmitButton></div>
    </form>
  );
}
