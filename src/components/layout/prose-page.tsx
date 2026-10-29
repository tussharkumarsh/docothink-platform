import type { ReactNode } from "react";

/** Simple long-form layout for content and legal pages. */
export function ProsePage({ title, lead, updated, children }: { title: string; lead?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {lead && <p className="mt-3 text-lg text-slate-600">{lead}</p>}
      {updated && <p className="mt-2 text-xs text-slate-500">Last updated {updated}</p>}
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}

export function LegalReviewNotice() {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Draft for legal review. This document must be reviewed by qualified counsel for each market (US, UK, India)
      before the service accepts real patients.
    </p>
  );
}
