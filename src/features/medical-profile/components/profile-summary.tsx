import { REVIEW_OF_SYSTEMS, SECTIONS } from "../schema";

type Data = Record<string, Record<string, unknown>>;

function Rows({ items, cols }: { items: Record<string, string>[]; cols: [string, string][] }) {
  if (!items?.length) return <p className="text-slate-400">None recorded</p>;
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i}>{cols.map(([k, label]) => (it[k] ? <span key={k} className="mr-2"><span className="text-slate-500">{label}:</span> {it[k]}</span> : null))}</li>
      ))}
    </ul>
  );
}

/** Read-only view of a patient's questionnaire for treating doctors. */
export function MedicalProfileSummary({ data, completed }: { data: Data; completed: string[] }) {
  const v = (s: string, k: string) => (data[s]?.[k] as string) || null;
  const items = (s: string) => (data[s]?.items as Record<string, string>[]) ?? [];
  const ros = Object.entries(REVIEW_OF_SYSTEMS)
    .map(([key, def]) => ({ label: def.label, symptoms: (data.review_of_systems?.[key] as string[]) ?? [] }))
    .filter((r) => r.symptoms.length);
  const answered = SECTIONS.filter((s) => data[s.key]).length;
  if (answered === 0) return <p className="text-sm text-slate-500">The patient hasn&apos;t filled in their medical profile yet.</p>;

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-medium text-slate-900">Allergies</dt>
        <dd className="text-slate-700">
          {v("allergies", "has_allergies") === "no" ? "No known allergies" : (
            <>
              {v("allergies", "drug_allergies") && <p>Drug allergies: {v("allergies", "drug_allergies")}</p>}
              <Rows items={items("allergies")} cols={[["substance", "Substance"], ["reaction", "Reaction"]]} />
            </>
          )}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900">Current medications</dt>
        <dd className="text-slate-700">{v("medications", "takes_medication") === "no" ? "None" : <Rows items={items("medications")} cols={[["name", "Medicine"], ["dose", "Dose"], ["frequency", "Frequency"]]} />}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900">Conditions</dt>
        <dd className="space-y-1 text-slate-700">
          {[["existing_conditions", "Existing"], ["have_you_ever_had", "Ever had"], ["other_illnesses", "Other"]].map(([k, l]) => v("conditions", k) && <p key={k}><span className="text-slate-500">{l}:</span> {v("conditions", k)}</p>)}
          {!data.conditions && <p className="text-slate-400">Not answered</p>}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900">Surgeries & hospital stays</dt>
        <dd className="text-slate-700"><Rows items={items("surgeries")} cols={[["procedure", "Procedure"], ["date", "Date"], ["complications", "Complications"]]} /></dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900">Family history</dt>
        <dd className="text-slate-700"><Rows items={items("family_history")} cols={[["relative", "Relative"], ["condition", "Condition"], ["living", "Living"], ["age_if_deceased", "Age at death"]]} /></dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900">Lifestyle</dt>
        <dd className="text-slate-700">
          {["exercise", "diet", "alcohol", "caffeine", "smoking"].map((k) => v("lifestyle", k) && <p key={k}><span className="capitalize text-slate-500">{k}:</span> {v("lifestyle", k)}</p>)}
          {!data.lifestyle && <p className="text-slate-400">Not answered</p>}
        </dd>
      </div>
      {data.womens_health && (
        <div>
          <dt className="font-medium text-slate-900">Women&apos;s health</dt>
          <dd className="text-slate-700">Pregnant: {v("womens_health", "pregnant") || "—"} · Breastfeeding: {v("womens_health", "breastfeeding") || "—"} · LMP: {v("womens_health", "last_menstrual_period") || "—"}</dd>
        </div>
      )}
      <div className="sm:col-span-2">
        <dt className="font-medium text-slate-900">Recent symptoms</dt>
        <dd className="text-slate-700">{ros.length ? ros.map((r) => <p key={r.label}><span className="text-slate-500">{r.label}:</span> {r.symptoms.join(", ")}</p>) : <span className="text-slate-400">None reported</span>}</dd>
      </div>
      {(v("treatments", "previous_treatments") || v("treatments", "other_comments")) && (
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-900">Previous treatments & notes</dt>
          <dd className="whitespace-pre-line text-slate-700">{[v("treatments", "previous_treatments"), v("treatments", "other_comments")].filter(Boolean).join("\n")}</dd>
        </div>
      )}
      <p className="text-xs text-slate-400 sm:col-span-2">{completed.length} of {SECTIONS.length} sections marked complete by the patient.</p>
    </dl>
  );
}
