"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Field, Input, Textarea, buttonClasses } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { saveTemplateAction } from "../actions";
import type { Template } from "../templates";
import { MedicineRows, useMedicineRows } from "./medicine-rows";

export function TemplateForm({ template }: { template: Template | null }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult, FormData>(saveTemplateAction, idle);
  const medicines = useMedicineRows(template?.items ?? []);

  useEffect(() => {
    if (state.ok && state.message) router.push("/doctor/templates");
  }, [state, router]);

  return (
    <form action={action} className="space-y-6">
      {template && <input type="hidden" name="template_id" value={template.id} />}
      <FormMessage state={state} />
      <p className="text-sm text-slate-600">Don&apos;t include patient details.</p>
      <Field label="Template name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={template?.name ?? ""} maxLength={80} placeholder="e.g. Viral fever" required />
      </Field>
      <MedicineRows medicines={medicines} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Treatment plan" htmlFor="treatment_plan"><Textarea id="treatment_plan" name="treatment_plan" rows={3} defaultValue={template?.treatment_plan ?? ""} /></Field>
        <Field label="Advice & precautions" htmlFor="advice"><Textarea id="advice" name="advice" rows={3} defaultValue={template?.advice ?? ""} /></Field>
        <Field label="Follow-up recommendation" htmlFor="follow_up"><Textarea id="follow_up" name="follow_up" rows={2} defaultValue={template?.follow_up ?? ""} /></Field>
      </div>
      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <SubmitButton pendingText="Saving…">Save template</SubmitButton>
        <Link href="/doctor/templates" className={buttonClasses("ghost")}>Cancel</Link>
      </div>
    </form>
  );
}
