import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { ProsePage } from "@/components/layout/prose-page";
import { HEALTH_TOPICS } from "@/content/health-topics";

export function generateStaticParams() {
  return HEALTH_TOPICS.map((t) => ({ topic: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/health/[topic]">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = HEALTH_TOPICS.find((t) => t.slug === slug);
  return { title: topic?.title ?? "Health topic" };
}

export default async function HealthTopicPage({ params }: PageProps<"/health/[topic]">) {
  const { topic: slug } = await params;
  const topic = HEALTH_TOPICS.find((t) => t.slug === slug);
  if (!topic) notFound();
  return (
    <ProsePage title={topic.title} lead={topic.intro}>
      {topic.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
          {s.bullets && <ul>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        </section>
      ))}
      <p className="text-sm text-slate-500">This page is general information, not medical advice for your situation.</p>
      <div className="pt-2"><ButtonLink href={`/doctors?specialty=${topic.specialty}`}>Find a doctor</ButtonLink></div>
    </ProsePage>
  );
}
