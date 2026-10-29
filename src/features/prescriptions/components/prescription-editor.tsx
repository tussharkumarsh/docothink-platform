"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { savePrescriptionAction } from "@/features/doctor/actions";
import type { PrescriptionView } from "./prescription-document";

type Item = Omit<PrescriptionView["prescription_items"][number], "id" | "position">;
const EMPTY: Item = { medication_name: "", strength: "", dosage_form: "", dose: "", route: "", frequency: "", duration: "", instructions: "" };
const ITEM_FIELDS: [keyof Item, string, string][] = [
  ["medication_name", "Medicine", "e.g. Amoxicillin"],
  ["strength", "Strength", "500 mg"],
  ["dosage_form", "Form", "Capsule"],
  ["dose", "Dose", "1 capsule"],
  ["route", "Route", "Oral"],
  ["frequency", "Frequency", "Three times daily"],
  ["duration", "Duration", "5 days"],
];

export function PrescriptionEditor({ rx }: { rx: PrescriptionView }) {
  const [state, action] = useActionState<ActionResult, FormData>(savePrescriptionAction, idle);
  const [items, setItems] = useState(() =>
    (rx.prescription_items.length ? [...rx.prescription_items].sort((a, b) => a.position - b.position) : [{ ...EMPTY }]).map((it, key) => ({ key, ...it })),
  );
  const [nextKey, setNextKey] = useState(items.length);
  const text = (name: keyof PrescriptionView, label: string, rows = 3, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <Textarea id={name} name={name} rows={rows} defaultValue={(rx[name] as string) ?? ""} />
    </Field>
  );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="prescription_id" value={rx.id} />
      <FormMessage state={state} />
      {rx.version > 1 && (
        <Field label="Reason for amendment" htmlFor="amendment_reason" required>
          <Input id="amendment_reason" name="amendment_reason" defaultValue={rx.amendment_reason ?? ""} required />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("presenting_symptoms", "Presenting symptoms")}
        {text("clinical_observations", "Clinical observations")}
        {text("relevant_history", "Relevant medical history")}
        {text("diagnosis", "Assessment / diagnosis", 3, "Required to finalise.")}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Medicines</legend>
        {items.map((item, index) => (
          <div key={item.key} className="rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {ITEM_FIELDS.map(([k, label, placeholder]) => (
                <Field key={k} label={label} htmlFor={`items.${index}.${k}`}>
                  <Input id={`items.${index}.${k}`} name={`items.${index}.${k}`} defaultValue={item[k] ?? ""} placeholder={placeholder} />
                </Field>
              ))}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <Field label="Instructions & precautions" htmlFor={`items.${index}.instructions`} className="flex-1">
                <Input id={`items.${index}.instructions`} name={`items.${index}.instructions`} defaultValue={item.instructions ?? ""} placeholder="e.g. Take after food" />
              </Field>
              <Button type="button" variant="ghost" aria-label={`Remove medicine ${index + 1}`} onClick={() => setItems(items.filter((i) => i.key !== item.key))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => { setItems([...items, { key: nextKey, ...EMPTY }]); setNextKey(nextKey + 1); }}>
          <Plus className="size-4" aria-hidden /> Add medicine
        </Button>
      </fieldset>

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
      <p className="text-xs text-slate-500">Clinical decisions are yours. Docothink never generates diagnoses or prescriptions.</p>
    </form>
  );
}
