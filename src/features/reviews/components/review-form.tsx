import { Field, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { submitReviewAction } from "../actions";

const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/** Five star radios (pure CSS: a checked star lights itself and every star before it). */
export function ReviewForm({ appointmentId }: { appointmentId: string }) {
  return (
    <ActionForm action={submitReviewAction} submitLabel="Submit review" pendingText="Submitting…" hideOnSuccess>
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-slate-700">Your rating</legend>
        <div className="flex flex-row-reverse justify-end gap-1 [&>input:checked~label]:text-amber-400 [&>label:hover]:text-amber-300 [&>label:hover~label]:text-amber-300">
          {[5, 4, 3, 2, 1].map((n) => (
            <StarInput key={n} n={n} />
          ))}
        </div>
      </fieldset>
      <Field label="Comment (optional)" htmlFor="comment" hint="Don't include personal details such as your phone number or address.">
        <Textarea id="comment" name="comment" rows={3} maxLength={1000} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="anonymous" /> Post anonymously
      </label>
    </ActionForm>
  );
}

function StarInput({ n }: { n: number }) {
  return (
    <>
      <input type="radio" id={`rating-${n}`} name="rating" value={n} required className="peer sr-only" />
      <label htmlFor={`rating-${n}`} className="cursor-pointer text-3xl leading-none text-slate-300 transition-colors" title={LABELS[n - 1]}>
        ★<span className="sr-only">{n} star{n === 1 ? "" : "s"}, {LABELS[n - 1]}</span>
      </label>
    </>
  );
}
