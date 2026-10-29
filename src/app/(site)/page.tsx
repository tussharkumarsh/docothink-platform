import Image from "next/image";
import Link from "next/link";
import { CalendarClock, FileText, Globe2, Lock, MessageSquare, Phone, ShieldCheck, Stethoscope, Video } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { getConditions, getFeaturedDoctors, getSpecialties } from "@/features/catalog/queries";
import { DoctorCard } from "@/features/catalog/components/doctor-card";
import { FAQ_GROUPS } from "@/content/faqs";

export default async function HomePage() {
  const [specialties, doctors, conditions] = await Promise.all([getSpecialties(), getFeaturedDoctors(), getConditions()]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-accent-600 ring-1 ring-accent-100">
              <ShieldCheck className="size-3.5" aria-hidden /> Verified, registered doctors
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              See a doctor online, on your schedule.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Book a text, audio or video consultation with specialists from India, the UK and the US. Every time slot
              is shown in your own time zone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/doctors" size="lg">
                Book an appointment
              </ButtonLink>
              <ButtonLink href="/how-it-works" size="lg" variant="secondary">
                How it works
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Globe2 className="size-4 text-brand-600" aria-hidden /> Time-zone aware booking</li>
              <li className="flex items-center gap-2"><Lock className="size-4 text-brand-600" aria-hidden /> Private, secure records</li>
              <li className="flex items-center gap-2"><FileText className="size-4 text-brand-600" aria-hidden /> Digital prescriptions</li>
            </ul>
          </div>
          <Card className="p-6 lg:ml-auto lg:max-w-md">
            <p className="text-sm font-medium text-slate-900">Choose how you want to consult</p>
            <ul className="mt-4 space-y-3">
              {[
                { icon: MessageSquare, title: "Text chat", body: "Message the doctor in real time at your booked time. Good for follow-ups and quick questions." },
                { icon: Phone, title: "Audio call", body: "Talk it through in your browser. No phone number needed." },
                { icon: Video, title: "Video call", body: "Face-to-face consultation for skin, eye and visible symptoms." },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3 rounded-lg border border-slate-100 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{title}</span>
                    <span className="block text-sm text-slate-600">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Specialties */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Find care by specialty</h2>
            <p className="mt-1 text-slate-600">From everyday illnesses to specialist second opinions.</p>
          </div>
          <Link href="/specialties" className="text-sm font-medium text-brand-700 hover:underline">
            All specialties →
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {specialties.slice(0, 12).map((s) => (
            <Link
              key={s.id}
              href={`/doctors?specialty=${s.slug}`}
              className="flex flex-col items-center gap-2 rounded-[--radius-card] border border-slate-200 p-4 text-center transition hover:border-brand-200 hover:bg-brand-50/40"
            >
              {s.icon_path ? (
                <Image src={s.icon_path} alt="" width={44} height={44} />
              ) : (
                <Stethoscope className="size-10 text-brand-600" aria-hidden />
              )}
              <span className="text-sm font-medium text-slate-800">{s.name}</span>
            </Link>
          ))}
        </div>
        {conditions.length > 0 && (
          <div className="mt-8">
            <p className="text-sm font-medium text-slate-700">Common concerns</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {conditions.map((c) => (
                <Link
                  key={c.slug}
                  href={c.specialty_slug ? `/doctors?specialty=${c.specialty_slug}` : "/doctors"}
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:border-brand-200 hover:text-brand-700"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Featured doctors */}
      {doctors.length > 0 && (
        <section className="bg-slate-50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">Verified doctors</h2>
            <p className="mt-1 text-slate-600">Every doctor&apos;s registration and identity are checked before they can consult.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {doctors.map((d) => (
                <DoctorCard key={d.user_id} doctor={d} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold text-slate-900">How online consultation works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { icon: Stethoscope, title: "Choose a doctor", body: "Filter by specialty, language, consultation type and fee." },
            { icon: CalendarClock, title: "Pick a time", body: "Slots appear in your local time, with the zone clearly labelled." },
            { icon: FileText, title: "Share your history", body: "Tell the doctor why you're visiting and upload any reports." },
            { icon: Video, title: "Consult & get a prescription", body: "Join by chat, audio or video. Prescriptions appear in your account." },
          ].map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-[--radius-card] border border-slate-200 p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <p className="mt-4 text-xs font-medium text-slate-500">Step {i + 1}</p>
              <p className="font-medium text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ preview */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold text-slate-900">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-[--radius-card] border border-slate-200 bg-white">
            {FAQ_GROUPS.flatMap((g) => g.items).slice(0, 6).map((faq) => (
              <details key={faq.question} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-slate-900 marker:hidden">
                  {faq.question}
                </summary>
                <p className="mt-2 text-sm text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
          <Link href="/faq" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            See all FAQs →
          </Link>
        </div>
      </section>

      {/* Doctor CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Card className="flex flex-col items-start justify-between gap-6 bg-brand-900 p-8 text-white sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Are you a registered doctor?</h2>
            <p className="mt-1 text-brand-100">Consult patients worldwide, set your own hours and fees, and get paid reliably.</p>
          </div>
          <ButtonLink href="/for-doctors" variant="accent" size="lg">
            Join Docothink
          </ButtonLink>
        </Card>
      </section>
    </>
  );
}
