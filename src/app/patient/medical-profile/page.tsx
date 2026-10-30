import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardHeader, PageHeader, cn } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { applicableSections, completion, type SectionKey } from "@/features/medical-profile/schema";
import { SectionForm } from "@/features/medical-profile/components/section-form";

export default async function MedicalProfilePage({ searchParams }: PageProps<"/patient/medical-profile">) {
  const viewer = await requireRole("patient", "/patient/medical-profile");
  const supabase = await createClient();
  const [{ data: profile }, { data: patient }] = await Promise.all([
    supabase.from("patient_medical_profiles").select("data, completed_sections, version, updated_at").eq("patient_id", viewer.id).single(),
    supabase.from("patient_profiles").select("sex").eq("user_id", viewer.id).single(),
  ]);
  const sections = applicableSections(patient?.sex ?? null);
  const requested = (await searchParams).section;
  const active = sections.find((s) => s.key === requested) ?? sections.find((s) => !profile?.completed_sections.includes(s.key)) ?? sections[0];
  const progress = completion(profile?.completed_sections ?? [], patient?.sex ?? null);
  const data = ((profile?.data as Record<string, Record<string, unknown>>) ?? {})[active.key] ?? {};

  return (
    <>
      <PageHeader
        title="Medical profile"
        description="Shared only with doctors treating you. Save any section as a draft and finish later."
      />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit p-4">
          <p className="text-sm font-medium text-slate-900">{progress.percent}% complete</p>
          <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
            <div className="h-2 rounded-full bg-accent-500" style={{ width: `${progress.percent}%` }} />
          </div>
          <nav className="mt-4 space-y-1" aria-label="Sections">
            {sections.map((s) => {
              const done = profile?.completed_sections.includes(s.key);
              return (
                <Link
                  key={s.key}
                  href={`/patient/medical-profile?section=${s.key}`}
                  aria-current={s.key === active.key ? "page" : undefined}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", s.key === active.key ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50")}
                >
                  {done ? <CheckCircle2 className="size-4 text-accent-500" aria-label="Complete" /> : <Circle className="size-4 text-slate-300" aria-label="Incomplete" />}
                  {s.title}
                </Link>
              );
            })}
          </nav>
          {!patient?.sex && (
            <p className="mt-4 text-xs text-slate-500">
              Add your sex in <Link href="/patient/profile" className="underline">personal details</Link> to see sections that apply to you.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title={active.title} description={active.description} />
          <div className="p-5">
            <SectionForm
              key={`${active.key}-${profile?.version}`}
              section={active.key as SectionKey}
              data={data}
              version={profile?.version ?? 1}
              completed={Boolean(profile?.completed_sections.includes(active.key))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
