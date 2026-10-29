import type { Metadata } from "next";
import { FAQ_GROUPS } from "@/content/faqs";

export const metadata: Metadata = { title: "Patient FAQs" };

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Frequently asked questions</h1>
      {FAQ_GROUPS.map((group) => (
        <section key={group.title} className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
          <div className="mt-3 divide-y divide-slate-200 rounded-card border border-slate-200">
            {group.items.map((faq) => (
              <details key={faq.question} className="px-5 py-4">
                <summary className="cursor-pointer font-medium text-slate-900">{faq.question}</summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
