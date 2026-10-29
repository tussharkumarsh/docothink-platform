"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui/form-client";
import { idle, type ActionResult } from "@/lib/errors";
import { saveMedicalSectionAction } from "../actions";
import { REVIEW_OF_SYSTEMS, type SectionKey } from "../schema";

type Data = Record<string, unknown>;
type Col = { name: string; label: string; required?: boolean; type?: "yesno" };

function YesNo({ name, value, label }: { name: string; value?: string; label: string }) {
  return (
    <Field label={label} htmlFor={name}>
      <Select id={name} name={name} defaultValue={value ?? ""}>
        <option value="">Choose…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
        <option value="unsure">Not sure</option>
      </Select>
    </Field>
  );
}

function Repeatable({ columns, initial, addLabel }: { columns: Col[]; initial: Record<string, string>[]; addLabel: string }) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{}]).map((r, i) => ({ key: i, values: r })));
  const [nextKey, setNextKey] = useState(rows.length);
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset key={row.key} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))_auto] sm:items-end">
          <legend className="sr-only">Entry {index + 1}</legend>
          {columns.map((c) => {
            const id = `items.${index}.${c.name}`;
            return c.type === "yesno" ? (
              <YesNo key={c.name} name={id} value={row.values[c.name]} label={c.label} />
            ) : (
              <Field key={c.name} label={c.label} htmlFor={id} required={c.required}>
                <Input id={id} name={id} defaultValue={row.values[c.name] ?? ""} />
              </Field>
            );
          })}
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove entry ${index + 1}`} onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </fieldset>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => { setRows([...rows, { key: nextKey, values: {} }]); setNextKey(nextKey + 1); }}>
        <Plus className="size-4" aria-hidden /> {addLabel}
      </Button>
    </div>
  );
}

export function SectionForm({ section, data, version, completed }: { section: SectionKey; data: Data; version: number; completed: boolean }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveMedicalSectionAction, idle);
  const v = (k: string) => (data[k] as string) ?? "";
  const items = (data.items as Record<string, string>[]) ?? [];

  let body: React.ReactNode = null;
  switch (section) {
    case "conditions":
      body = (
        <>
          <Field label="Existing conditions and diagnoses" htmlFor="existing_conditions" hint="e.g. type 2 diabetes (2019), asthma"><Textarea id="existing_conditions" name="existing_conditions" defaultValue={v("existing_conditions")} /></Field>
          <Field label="Have you ever had…" htmlFor="have_you_ever_had" hint="e.g. tuberculosis, hepatitis, cancer, stroke, heart attack"><Textarea id="have_you_ever_had" name="have_you_ever_had" defaultValue={v("have_you_ever_had")} /></Field>
          <Field label="Other illnesses" htmlFor="other_illnesses"><Textarea id="other_illnesses" name="other_illnesses" defaultValue={v("other_illnesses")} /></Field>
        </>
      );
      break;
    case "medications":
      body = (
        <>
          <YesNo name="takes_medication" value={v("takes_medication")} label="Do you take any medication, supplements or herbs?" />
          <Repeatable columns={[{ name: "name", label: "Medicine", required: true }, { name: "dose", label: "Dose" }, { name: "frequency", label: "How often" }]} initial={items} addLabel="Add medicine" />
        </>
      );
      break;
    case "allergies":
      body = (
        <>
          <YesNo name="has_allergies" value={v("has_allergies")} label="Do you have allergies to medicines or other substances?" />
          <Field label="Drug allergies" htmlFor="drug_allergies"><Textarea id="drug_allergies" name="drug_allergies" rows={2} defaultValue={v("drug_allergies")} /></Field>
          <Repeatable columns={[{ name: "substance", label: "Substance", required: true }, { name: "reaction", label: "Reaction" }]} initial={items} addLabel="Add allergy" />
        </>
      );
      break;
    case "surgeries":
      body = <Repeatable columns={[{ name: "procedure", label: "Procedure or hospital stay", required: true }, { name: "date", label: "Approximate date" }, { name: "complications", label: "Complications" }]} initial={items} addLabel="Add procedure" />;
      break;
    case "family_history":
      body = <Repeatable columns={[{ name: "relative", label: "Relative", required: true }, { name: "condition", label: "Condition", required: true }, { name: "living", label: "Living?", type: "yesno" }, { name: "age_if_deceased", label: "Age if deceased" }]} initial={items} addLabel="Add family member" />;
      break;
    case "lifestyle":
      body = (
        <div className="grid gap-4 sm:grid-cols-2">
          {[["exercise", "Exercise"], ["diet", "Diet you follow"], ["alcohol", "Alcohol consumption"], ["caffeine", "Caffeine consumption"], ["smoking", "Smoking or tobacco"]].map(([k, label]) => (
            <Field key={k} label={label} htmlFor={k}><Input id={k} name={k} defaultValue={v(k)} /></Field>
          ))}
        </div>
      );
      break;
    case "review_of_systems":
      body = (
        <div className="grid gap-5 sm:grid-cols-2">
          {Object.entries(REVIEW_OF_SYSTEMS).map(([key, def]) => {
            const selected = (data[key] as string[]) ?? [];
            return (
              <fieldset key={key}>
                <legend className="text-sm font-medium text-slate-800">{def.label}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {def.symptoms.map((s) => (
                    <label key={s} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="checkbox" name={`ros.${key}`} value={s} defaultChecked={selected.includes(s)} className="size-3" />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      );
      break;
    case "treatments":
      body = (
        <>
          <Field label="Previous treatments" htmlFor="previous_treatments"><Textarea id="previous_treatments" name="previous_treatments" defaultValue={v("previous_treatments")} /></Field>
          <Field label="Anything else about your medical history" htmlFor="other_comments"><Textarea id="other_comments" name="other_comments" defaultValue={v("other_comments")} /></Field>
        </>
      );
      break;
    case "womens_health":
      body = (
        <div className="grid gap-4 sm:grid-cols-3">
          <YesNo name="pregnant" value={v("pregnant")} label="Are you pregnant?" />
          <YesNo name="breastfeeding" value={v("breastfeeding")} label="Are you breastfeeding?" />
          <Field label="First day of last period" htmlFor="last_menstrual_period"><Input id="last_menstrual_period" name="last_menstrual_period" type="date" defaultValue={v("last_menstrual_period")} /></Field>
        </div>
      );
      break;
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="version" value={version} />
      <FormMessage state={state} />
      {body}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <SubmitButton name="intent" value="complete" pendingText="Saving…">{completed ? "Save" : "Save and mark complete"}</SubmitButton>
        {!completed && <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save draft</SubmitButton>}
      </div>
    </form>
  );
}
