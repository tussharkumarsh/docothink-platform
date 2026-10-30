import { Award, BookOpen, Sparkles, Stethoscope, Users } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import type { DoctorDetail } from "../queries";

type Sections = Pick<DoctorDetail, "special_interests" | "services" | "skills" | "awards" | "memberships" | "publications">;

const meta = (...parts: (string | number | undefined)[]) => parts.filter((p) => p !== undefined && p !== "").join(" · ");

/** Practo-style professional sections; each renders only when the doctor has filled it in. */
export function ProfileSections({ doctor }: { doctor: Sections }) {
  const interests = doctor.special_interests ?? [];
  const services = doctor.services ?? [];
  const skills = doctor.skills ?? [];
  const awards = doctor.awards ?? [];
  const memberships = doctor.memberships ?? [];
  const publications = doctor.publications ?? [];
  return (
    <>
      {(interests.length > 0 || skills.length > 0) && (
        <Card>
          <CardHeader title="Special interests & conditions treated" />
          <div className="flex flex-wrap gap-2 p-5">
            {interests.map((i) => <Badge key={`i-${i}`} tone="info"><Sparkles className="size-3" aria-hidden /> {i}</Badge>)}
            {skills.map((s) => <Badge key={`s-${s}`}>{s}</Badge>)}
          </div>
        </Card>
      )}
      {services.length > 0 && (
        <Card>
          <CardHeader title="Services & treatments" />
          <ul className="grid gap-2 p-5 text-sm text-slate-700 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s} className="flex items-start gap-2"><Stethoscope className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {s}</li>
            ))}
          </ul>
        </Card>
      )}
      {awards.length > 0 && (
        <Card>
          <CardHeader title="Awards & recognitions" />
          <ul className="space-y-3 p-5 text-sm">
            {awards.map((a, i) => (
              <li key={i} className="flex items-start gap-3">
                <Award className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                <span><span className="font-medium text-slate-900">{a.title}</span><span className="block text-slate-500">{meta(a.organization, a.year)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {memberships.length > 0 && (
        <Card>
          <CardHeader title="Memberships" />
          <ul className="space-y-3 p-5 text-sm">
            {memberships.map((m, i) => (
              <li key={i} className="flex items-start gap-3">
                <Users className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                <span><span className="font-medium text-slate-900">{m.organization}</span><span className="block text-slate-500">{meta(m.role, m.since ? `since ${m.since}` : undefined)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {publications.length > 0 && (
        <Card>
          <CardHeader title="Publications" />
          <ul className="space-y-3 p-5 text-sm">
            {publications.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                <span>
                  {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">{p.title}</a> : <span className="font-medium text-slate-900">{p.title}</span>}
                  <span className="block text-slate-500">{meta(p.journal, p.year)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
