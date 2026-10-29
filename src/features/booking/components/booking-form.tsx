"use client";

import { useActionState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { bookAppointmentAction } from "../actions";

export function BookingForm(props: {
  doctorId: string;
  start: string;
  mode: string;
  timezone: string;
  timezones: string[];
  paymentMode: "provider" | "test" | "none";
}) {
  const [state, action] = useActionState<ActionResult, FormData>(bookAppointmentAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="doctor_id" value={props.doctorId} />
      <input type="hidden" name="start" value={props.start} />
      <input type="hidden" name="mode" value={props.mode} />
      <FormMessage state={state} />
      <Field label="Reason for your visit" htmlFor="reason" required error={fieldError(state, "reason")} hint="Your symptoms and what you'd like help with. Only your doctor sees this.">
        <Textarea id="reason" name="reason" required maxLength={4000} />
      </Field>
      <Field label="How long have you had these symptoms?" htmlFor="symptoms_duration">
        <Input id="symptoms_duration" name="symptoms_duration" placeholder="e.g. 2 weeks" maxLength={200} />
      </Field>
      <Field label="Your time zone" htmlFor="timezone" error={fieldError(state, "timezone")} hint="Used for your confirmation email and reminders.">
        <Select id="timezone" name="timezone" defaultValue={props.timezone}>
          {(props.timezones.includes(props.timezone) ? props.timezones : [props.timezone, ...props.timezones]).map((z) => (
            <option key={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="consent" className="mt-1" required />
        <span>I understand this is not an emergency service, and I agree to the cancellation policy.</span>
      </label>
      {fieldError(state, "consent") && <p className="text-xs text-red-600">{fieldError(state, "consent")}</p>}
      <SubmitButton className="w-full" size="lg" pendingText={props.paymentMode === "test" ? "Confirming your booking…" : "Reserving your slot…"}>
        {props.paymentMode === "provider" ? "Reserve and continue to payment" : props.paymentMode === "test" ? "Confirm booking" : "Reserve slot"}
      </SubmitButton>
      {props.paymentMode !== "test" && <p className="text-xs text-slate-500">Your slot is held for 15 minutes while you complete payment.</p>}
    </form>
  );
}
