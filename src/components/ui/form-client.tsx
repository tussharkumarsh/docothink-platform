"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Alert, Button } from "./index";
import { idle, type ActionResult } from "@/lib/errors";

/**
 * Binds a server action `(prev, formData) => ActionResult` to a form with pending and result states.
 * Server components can pass both the action and server-rendered fields as children.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingText,
  variant,
  confirm,
  className,
  hideOnSuccess,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submitLabel: string;
  pendingText?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  confirm?: string;
  className?: string;
  hideOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, idle);
  if (hideOnSuccess && state.ok && state.message) return <FormMessage state={state} />;
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      <FormMessage state={state} />
      {children}
      {confirm ? (
        <ConfirmSubmit message={confirm} variant={variant}>{submitLabel}</ConfirmSubmit>
      ) : (
        <SubmitButton variant={variant} pendingText={pendingText}>{submitLabel}</SubmitButton>
      )}
    </form>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionResult<unknown> }) {
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  if (!state.ok) return <Alert tone="danger">{state.error}</Alert>;
  return null;
}

export function fieldError(state: ActionResult<unknown>, name: string): string | undefined {
  return !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;
}

/** Confirm-before-submit for destructive actions (no-JS falls back to submitting). */
export function ConfirmSubmit({ message, children, ...props }: ComponentProps<typeof Button> & { message: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
