"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { EMPTY_ITEM, type TemplateItem } from "../templates";

const ITEM_FIELDS: [keyof typeof EMPTY_ITEM, string, string][] = [
  ["medication_name", "Medicine", "e.g. Amoxicillin"],
  ["strength", "Strength", "500 mg"],
  ["dosage_form", "Form", "Capsule"],
  ["dose", "Dose", "1 capsule"],
  ["route", "Route", "Oral"],
  ["frequency", "Frequency", "Three times daily"],
  ["duration", "Duration", "5 days"],
];

/** Row state for `MedicineRows`. `replaceAll` issues new keys, so remounted inputs show the new values. */
export function useMedicineRows(initial: TemplateItem[]) {
  const [state, setState] = useState(() => {
    const items = initial.length ? initial : [{ ...EMPTY_ITEM }];
    return { rows: items.map((item, key) => ({ key, ...item })), nextKey: items.length };
  });
  return {
    rows: state.rows,
    add: () => setState((s) => ({ rows: [...s.rows, { key: s.nextKey, ...EMPTY_ITEM }], nextKey: s.nextKey + 1 })),
    remove: (key: number) => setState((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== key) })),
    replaceAll: (items: TemplateItem[]) =>
      setState((s) => ({ rows: items.map((item, i) => ({ key: s.nextKey + i, ...item })), nextKey: s.nextKey + items.length })),
  };
}

export function MedicineRows({ medicines }: { medicines: ReturnType<typeof useMedicineRows> }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-900">Medicines</legend>
      {medicines.rows.map((item, index) => (
        <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
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
            <Button type="button" variant="ghost" aria-label={`Remove medicine ${index + 1}`} onClick={() => medicines.remove(item.key)}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={medicines.add}>
        <Plus className="size-4" aria-hidden /> Add medicine
      </Button>
    </fieldset>
  );
}
