import Image from "next/image";
import Link from "next/link";
import { CalendarClock, ChevronRight, FileText, Globe2, Lock, MessageSquare, Phone, ShieldCheck, Stethoscope, Video } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { getConditions, getFeaturedDoctors, getSpecialties } from "@/features/catalog/queries";
import { DoctorCard } from "@/features/catalog/components/doctor-card";
import { FAQ_GROUPS } from "@/content/faqs";

function SectionHeading({ title, description, align = "center" }: { title: string; description?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <h2 className="text-3xl font-semibold text-slate-900 sm:text-5xl">{title}</h2>
      {description && <p className="mt-4 text-lg text-slate-500 sm:text-xl">{description}</p>}
    </div>
  );
}

export default async function HomePage() {
  const [specialties, doctors, conditions] = await Promise.all([getSpecialties(), getFeaturedDoctors(), getConditions()]);

  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600">
          <ShieldCheck className="size-4" aria-hidden /> Verified, registered doctors
        </p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[1.05] text-slate-900 sm:text-7xl">
          See a doctor online.
          <span className="block text-slate-400">On your schedule.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500 sm:text-xl">
          Text, audio or video consultations with specialists from India, the UK and the US. Every time slot is shown in
          your own time zone.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <ButtonLink href="/doctors" size="lg">
            Book a consultation
          </ButtonLink>
          <Link href="/how-it-works" className="group inline-flex items-center gap-0.5 text-[17px] text-brand-700 hover:underline">
            Learn how it works
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <ul className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
          <li className="flex items-center gap-2"><Globe2 className="size-4 text-slate-400" aria-hidden /> Time-zone aware booking</li>
          <li className="flex items-center gap-2"><Lock className="size-4 text-slate-400" aria-hidden /> Private, secure records</li>
          <li className="flex items-center gap-2"><FileText className="size-4 text-slate-400" aria-hidden /> Digital prescriptions</li>
        </ul>
      </section>

      {/* Consultation types */}
      <section className="bg-slate-50 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="Consult your way." description="Choose the format that suits your concern. Switch to video later if you need to." />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { icon: MessageSquare, title: "Text chat", body: "Message the doctor in real time at your booked time. Good for follow-ups and quick questions." },
              { icon: Phone, title: "Audio call", body: "Talk it through in your browser. No phone number needed." },
              { icon: Video, title: "Video call", body: "Face-to-face consultation for skin, eye and visible symptoms." },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title} className="p-8">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="size-6" aria-hidden />
                </span>
                <p className="mt-6 text-xl font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-[15px] leading-6 text-slate-500">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Specialties */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading align="left" title="Find care by specialty." description="From everyday illnesses to specialist second opinions." />
            <Link href="/specialties" className="group inline-flex items-center gap-0.5 text-[17px] text-brand-700 hover:underline">
              All specialties
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {specialties.slice(0, 12).map((s) => (
              <Link
                key={s.id}
                href={`/doctors?specialty=${s.slug}`}
                className="flex flex-col items-center gap-3 rounded-card bg-slate-50 px-3 py-6 text-center transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                {s.icon_path ? (
                  <Image src={s.icon_path} alt="" width={48} height={48} />
                ) : (
                  <Stethoscope className="size-10 text-brand-600" aria-hidden />
                )}
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
              </Link>
            ))}
          </div>
          {conditions.length > 0 && (
            <div className="mt-12">
              <p className="text-sm font-semibold text-slate-900">Common concerns</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {conditions.map((c) => (
                  <Link
                    key={c.slug}
                    href={c.specialty_slug ? `/doctors?specialty=${c.specialty_slug}` : "/doctors"}
                    className="rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Featured doctors */}
      {doctors.length > 0 && (
        <section className="bg-slate-50 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <SectionHeading title="Verified doctors." description="Every doctor's registration and identity are checked before they can consult." />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {doctors.map((d) => (
                <DoctorCard key={d.user_id} doctor={d} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <ButtonLink href="/doctors" variant="secondary">
                See all doctors
              </ButtonLink>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="Four simple steps." description="From choosing a doctor to a prescription in your account." />
          <ol className="mt-14 grid gap-5 md:grid-cols-4">
            {[
              { icon: Stethoscope, title: "Choose a doctor", body: "Filter by specialty, language, consultation type and fee." },
              { icon: CalendarClock, title: "Pick a time", body: "Slots appear in your local time, with the zone clearly labelled." },
              { icon: FileText, title: "Share your history", body: "Tell the doctor why you're visiting and upload any reports." },
              { icon: Video, title: "Consult & get a prescription", body: "Join by chat, audio or video. Prescriptions appear in your account." },
            ].map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="rounded-card bg-slate-50 p-7">
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-semibold tracking-tight text-slate-300">{i + 1}</span>
                  <Icon className="size-6 text-brand-600" aria-hidden />
                </div>
                <p className="mt-6 text-[17px] font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ preview */}
      <section className="bg-slate-50 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <SectionHeading title="Questions? Answers." />
          <Card className="mt-12 divide-y divide-slate-100">
            {FAQ_GROUPS.flatMap((g) => g.items).slice(0, 6).map((faq) => (
              <details key={faq.question} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-slate-900 marker:hidden">
                  {faq.question}
                  <ChevronRight className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-3 text-[15px] leading-6 text-slate-500">{faq.answer}</p>
              </details>
            ))}
          </Card>
          <div className="mt-8 text-center">
            <Link href="/faq" className="group inline-flex items-center gap-0.5 text-[17px] text-brand-700 hover:underline">
              See all FAQs
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Doctor CTA */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-slate-950 px-8 py-16 text-center text-white sm:py-20">
          <h2 className="text-3xl font-semibold sm:text-5xl">Are you a registered doctor?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
            Consult patients worldwide, set your own hours and fees, and get paid reliably.
          </p>
          <ButtonLink href="/for-doctors" size="lg" className="mt-10">
            Join Docothink
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
