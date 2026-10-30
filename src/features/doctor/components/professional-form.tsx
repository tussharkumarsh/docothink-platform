import { Field, Input, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { updateProfessionalDetailsAction } from "../actions";

export type ProfessionalRow = {
  special_interests: string[];
  services: string[];
  skills: string[];
  awards: { title: string; organization?: string; year?: number }[];
  memberships: { organization: string; role?: string; since?: number }[];
  publications: { title: string; journal?: string; year?: number; url?: string }[];
  practice_started_year: number | null;
};

const join = (rows: (string | number | undefined)[][]) => rows.map((r) => r.filter((v) => v !== undefined && v !== "").join(" | ")).join("\n");

/** Education and experience stay on the Public profile tab; this tab adds what patients compare on. */
export function ProfessionalForm({ doctor }: { doctor: ProfessionalRow }) {
  return (
    <ActionForm action={updateProfessionalDetailsAction} submitLabel="Save professional details" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Special interests" htmlFor="special_interests" hint="One per line, up to 15. e.g. Paediatric dermatology">
          <Textarea id="special_interests" name="special_interests" rows={4} defaultValue={doctor.special_interests.join("\n")} />
        </Field>
        <Field label="Skills & conditions treated" htmlFor="skills" hint="One per line, up to 30. e.g. Acne, Eczema">
          <Textarea id="skills" name="skills" rows={4} defaultValue={doctor.skills.join("\n")} />
        </Field>
      </div>
      <Field label="Services & treatments" htmlFor="services" hint="One per line, up to 40. e.g. Acne treatment, Hair-loss consultation">
        <Textarea id="services" name="services" rows={5} defaultValue={doctor.services.join("\n")} />
      </Field>
      <Field label="Awards & recognitions" htmlFor="awards" hint="One per line: Title | Organisation | Year">
        <Textarea id="awards" name="awards" rows={3} defaultValue={join(doctor.awards.map((a) => [a.title, a.organization, a.year]))} />
      </Field>
      <Field label="Professional memberships" htmlFor="memberships" hint="One per line: Organisation | Role | Since (year)">
        <Textarea id="memberships" name="memberships" rows={3} defaultValue={join(doctor.memberships.map((m) => [m.organization, m.role, m.since]))} />
      </Field>
      <Field label="Publications (optional)" htmlFor="publications" hint="One per line: Title | Journal | Year | https://link">
        <Textarea id="publications" name="publications" rows={3} defaultValue={join(doctor.publications.map((p) => [p.title, p.journal, p.year, p.url]))} />
      </Field>
      <Field label="Year you started practising" htmlFor="practice_started_year" hint="Shown as years of experience overall" className="max-w-xs">
        <Input id="practice_started_year" name="practice_started_year" inputMode="numeric" maxLength={4} defaultValue={doctor.practice_started_year ?? ""} />
      </Field>
    </ActionForm>
  );
}
