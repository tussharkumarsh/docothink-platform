import { formatDate, formatDateTime } from "@/lib/time/format";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

export type PrescriptionView = {
  id: string;
  version: number;
  status: "draft" | "final" | "superseded";
  presenting_symptoms: string | null;
  clinical_observations: string | null;
  relevant_history: string | null;
  diagnosis: string | null;
  treatment_plan: string | null;
  advice: string | null;
  follow_up: string | null;
  amendment_reason: string | null;
  doctor_snapshot: { name: string; qualifications: string | null; registration_number: string | null; registration_council: string | null; registration_country: string | null } | null;
  patient_snapshot: { name: string; date_of_birth: string | null; sex: string | null; consultation_date: string; consultation_mode: ConsultationMode; reference: string } | null;
  content_hash: string | null;
  finalized_at: string | null;
  prescription_items: {
    id: string;
    position: number;
    medication_name: string;
    strength: string | null;
    dosage_form: string | null;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  }[];
};

export const PRESCRIPTION_SELECT =
  "id, version, status, presenting_symptoms, clinical_observations, relevant_history, diagnosis, treatment_plan, advice, follow_up, amendment_reason, doctor_snapshot, patient_snapshot, content_hash, finalized_at, prescription_items(id, position, medication_name, strength, dosage_form, dose, route, frequency, duration, instructions)";

function Section({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{value}</p>
    </section>
  );
}

/** Rendered from the finalised snapshot: what was signed is what is shown and printed. */
export function PrescriptionDocument({ rx, timezone }: { rx: PrescriptionView; timezone: string }) {
  const d = rx.doctor_snapshot;
  const p = rx.patient_snapshot;
  const items = [...rx.prescription_items].sort((a, b) => a.position - b.position);
  return (
    <article className="space-y-6 bg-white p-6 sm:p-8 print:p-0" aria-label="Prescription">
      {rx.status === "superseded" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This version was superseded by an amendment.</p>
      )}
      <header className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">{d?.name}</p>
          <p className="text-sm text-slate-600">{d?.qualifications}</p>
          <p className="text-xs text-slate-500">
            Reg. {d?.registration_number} · {d?.registration_council} {d?.registration_country ? `(${d.registration_country})` : ""}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium text-slate-900">Prescription · v{rx.version}</p>
          {p && <p className="text-slate-600">{formatDateTime(p.consultation_date, timezone)}</p>}
          {p && <p className="text-xs text-slate-500">Ref {p.reference} · {MODE_LABELS[p.consultation_mode]}</p>}
        </div>
      </header>
      {p && (
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">Patient</dt><dd className="font-medium text-slate-900">{p.name}</dd></div>
          <div><dt className="text-slate-500">Date of birth</dt><dd>{p.date_of_birth ? formatDate(p.date_of_birth) : "—"}</dd></div>
          <div><dt className="text-slate-500">Sex</dt><dd className="capitalize">{p.sex?.replaceAll("_", " ") ?? "—"}</dd></div>
        </dl>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Presenting symptoms" value={rx.presenting_symptoms} />
        <Section title="Clinical observations" value={rx.clinical_observations} />
        <Section title="Relevant history" value={rx.relevant_history} />
        <Section title="Assessment / diagnosis" value={rx.diagnosis} />
      </div>
      {items.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medicines</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr><th className="py-2 pr-2">Medicine</th><th className="pr-2">Dose</th><th className="pr-2">Route</th><th className="pr-2">Frequency</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-2">
                    <span className="font-medium text-slate-900">{i.medication_name}</span> {i.strength} {i.dosage_form && <span className="text-slate-500">({i.dosage_form})</span>}
                    {i.instructions && <span className="block text-xs text-slate-600">{i.instructions}</span>}
                  </td>
                  <td className="pr-2">{i.dose}</td>
                  <td className="pr-2">{i.route}</td>
                  <td className="pr-2">{i.frequency}</td>
                  <td>{i.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Treatment plan" value={rx.treatment_plan} />
        <Section title="Advice & precautions" value={rx.advice} />
        <Section title="Follow-up" value={rx.follow_up} />
        <Section title="Amendment reason" value={rx.amendment_reason} />
      </div>
      {rx.finalized_at && (
        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          Electronically signed by {d?.name} on {formatDateTime(rx.finalized_at, timezone)} after authenticated sign-in.
          <br />
          Document fingerprint (SHA-256): <span className="break-all font-mono">{rx.content_hash}</span>
        </footer>
      )}
    </article>
  );
}
