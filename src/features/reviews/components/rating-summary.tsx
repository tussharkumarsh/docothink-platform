import { Star } from "lucide-react";
import type { RatingDistribution, Stars } from "../summary";

export function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={className} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={`inline size-4 ${n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}`} />
      ))}
    </span>
  );
}

export function RatingSummary({ avg, distribution }: { avg: number; distribution: RatingDistribution }) {
  return (
    <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center sm:pr-6">
        <p className="text-5xl font-semibold tracking-tight text-slate-900">{Number(avg).toFixed(1)}</p>
        <StarRow rating={Number(avg)} className="mt-2 block" />
        <p className="mt-1 text-sm text-slate-500">{distribution.total} rating{distribution.total === 1 ? "" : "s"}</p>
      </div>
      <dl className="space-y-1.5">
        {([5, 4, 3, 2, 1] as Stars[]).map((n) => {
          const count = distribution.counts[n];
          const pct = distribution.total ? Math.round((count / distribution.total) * 100) : 0;
          return (
            <div key={n} className="flex items-center gap-3 text-sm">
              <dt className="w-10 text-slate-600">{n} star</dt>
              <dd className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
              </dd>
              <dd className="w-10 text-right tabular-nums text-slate-500">{count}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
