"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton, submitKeepingValues } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { savePrescriptionAction } from "@/features/doctor/actions";
import { saveTemplateAction } from "../actions";
import { mergeTemplate, TEXT_LIMITS, type Template, type TemplateItem } from "../templates";
import { MedicineRows, useMedicineRows } from "./medicine-rows";
import type { PrescriptionView } from "./prescription-document";

const TEXT_FIELDS = Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[];

/** The medicine rows as currently typed, in order, from the form itself. */
function readRows(data: FormData): TemplateItem[] {
  const rows: Record<number, Record<string, string>> = {};
  for (const [name, value] of data.entries()) {
    const m = name.match(/^items\.(\d+)\.(\w+)$/);
    if (m && typeof value === "string") (rows[Number(m[1])] ??= {})[m[2]] = value;
  }
  return Object.keys(rows).map(Number).sort((a, b) => a - b).map((k) => rows[k]);
}

export function PrescriptionEditor({ rx, templates }: { rx: PrescriptionView; templates: Template[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(savePrescriptionAction, idle);
  const medicines = useMedicineRows([...rx.prescription_items].sort((a, b) => a.position - b.position));
  const formRef = useRef<HTMLFormElement>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [saveResult, setSaveResult] = useState<ActionResult>(idle);
  const [saving, startSaving] = useTransition();

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    const form = formRef.current;
    if (!template || !form) return;
    const data = new FormData(form);
    const merged = mergeTemplate(
      {
        items: readRows(data),
        treatment_plan: String(data.get("treatment_plan") ?? ""),
        advice: String(data.get("advice") ?? ""),
        follow_up: String(data.get("follow_up") ?? ""),
      },
      template,
    );
    if (!merged.ok) {
      setApplyError(merged.error);
      return;
    }
    setApplyError(null);
    medicines.replaceAll(merged.items.length ? merged.items : [{}]);
    for (const field of TEXT_FIELDS) (form.elements.namedItem(field) as HTMLTextAreaElement).value = merged[field];
  }

  function saveAsTemplate() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("name", templateName);
    startSaving(async () => setSaveResult(await saveTemplateAction(idle, data)));
  }

  const text = (name: keyof PrescriptionView, label: string, rows = 3, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <Textarea id={name} name={name} rows={rows} defaultValue={(rx[name] as string) ?? ""} />
    </Field>
  );

  return (
    <form ref={formRef} action={action} onSubmit={submitKeepingValues(action)} className="space-y-6">
      <input type="hidden" name="prescription_id" value={rx.id} />
      <FormMessage state={state} />
      {rx.version > 1 && (
        <Field label="Reason for amendment" htmlFor="amendment_reason" required>
          <Input id="amendment_reason" name="amendment_reason" defaultValue={rx.amendment_reason ?? ""} required />
        </Field>
      )}
      <div className="max-w-sm">
        {templates.length ? (
          <Field label="Use template" htmlFor="use_template" hint="Adds to the form below. Nothing is saved until you save or sign.">
            <Select id="use_template" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Choose a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-slate-600">Write common prescriptions faster with <Link href="/doctor/templates" className="text-brand-700 hover:underline">Rx templates</Link>.</p>
        )}
        {applyError && <Alert tone="warning" className="mt-2">{applyError}</Alert>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("presenting_symptoms", "Presenting symptoms")}
        {text("clinical_observations", "Clinical observations")}
        {text("relevant_history", "Relevant medical history")}
        {text("diagnosis", "Assessment / diagnosis", 3, "Required to finalise.")}
      </div>

      <MedicineRows medicines={medicines} />

      <div className="grid gap-4 sm:grid-cols-2">
        {text("treatment_plan", "Treatment plan")}
        {text("advice", "Advice & precautions")}
        {text("follow_up", "Follow-up recommendation", 2)}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save draft</SubmitButton>
        <SubmitButton
          name="intent"
          value="finalize"
          pendingText="Finalising…"
          onClick={(e) => { if (!window.confirm("Finalise and sign this prescription? It can't be edited afterwards, only amended.")) e.preventDefault(); }}
        >
          Finalise & sign
        </SubmitButton>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="mb-2 text-sm font-medium text-slate-900">Save as template</p>
        <p className="mb-2 text-xs text-slate-500">Saves the medicines, treatment plan, advice and follow-up above, without saving this draft. Don&apos;t include patient details.</p>
        <FormMessage state={saveResult} />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Template name"
            className="max-w-xs"
            maxLength={80}
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveAsTemplate(); } }}
          />
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={saveAsTemplate}>{saving ? "Saving…" : "Save as template"}</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">Clinical decisions are yours. Docothink never generates diagnoses or prescriptions.</p>
    </form>
  );
}
