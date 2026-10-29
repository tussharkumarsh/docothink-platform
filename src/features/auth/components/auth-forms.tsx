"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useBrowserTimezone } from "@/lib/time/use-browser-timezone";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import {
  forgotPasswordAction,
  magicLinkAction,
  resetPasswordAction,
  signInAction,
  signUpDoctorAction,
  signUpPatientAction,
} from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(signInAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldError(state, "password")}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-brand-700 hover:underline">Forgot password?</Link>
      </div>
      <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function MagicLinkForm({ next, cta = "Email me a sign-in link" }: { next?: string; cta?: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(magicLinkAction, idle);
  const tz = useBrowserTimezone();
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="timezone" value={tz} />
      <FormMessage state={state} />
      {!(state.ok && state.message) && (
        <>
          <Field label="Email" htmlFor="ml-email" error={fieldError(state, "email")} hint="Your email becomes your username.">
            <Input id="ml-email" name="email" type="email" autoComplete="email" required />
          </Field>
          <SubmitButton variant="secondary" className="w-full" pendingText="Sending…">{cta}</SubmitButton>
        </>
      )}
    </form>
  );
}

export function SignUpForm({ role, next }: { role: "patient" | "doctor"; next?: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(role === "doctor" ? signUpDoctorAction : signUpPatientAction, idle);
  const tz = useBrowserTimezone();
  if (state.ok && state.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="full_name" error={fieldError(state, "full_name")} required>
        <Input id="full_name" name="full_name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")} required hint="Your email is your username.">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldError(state, "password")} required hint="At least 10 characters with upper- and lowercase letters and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Time zone" htmlFor="timezone" hint="Detected from your browser; you can change it later." error={fieldError(state, "timezone")}>
        <Input id="timezone" name="timezone" value={tz} onChange={() => {}} readOnly />
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="accept" className="mt-1" required />
        <span>
          I agree to the <Link href="/legal/terms" className="text-brand-700 underline">terms</Link> and{" "}
          <Link href="/legal/privacy" className="text-brand-700 underline">privacy policy</Link>, and understand Docothink is not for emergencies.
        </span>
      </label>
      {fieldError(state, "accept") && <p className="text-xs text-red-600">{fieldError(state, "accept")}</p>}
      <SubmitButton className="w-full" pendingText="Creating account…">
        {role === "doctor" ? "Create doctor account" : "Create account"}
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionResult, FormData>(forgotPasswordAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionResult, FormData>(resetPasswordAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" error={fieldError(state, "password")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldError(state, "confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Saving…">Set new password</SubmitButton>
    </form>
  );
}
