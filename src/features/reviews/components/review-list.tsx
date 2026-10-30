import { BadgeCheck } from "lucide-react";
import { formatDate } from "@/lib/time/format";
import type { PublicReview } from "../queries";
import { StarRow } from "./rating-summary";

export function ReviewList({ reviews, timezone = "UTC" }: { reviews: PublicReview[]; timezone?: string }) {
  if (reviews.length === 0) return <p className="px-5 pb-5 text-sm text-slate-500">No written reviews yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {reviews.map((r) => (
        <li key={r.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StarRow rating={r.rating} />
            <span className="text-xs text-slate-500">{formatDate(r.created_at, timezone)}</span>
          </div>
          {r.comment && <p className="mt-2 text-[15px] leading-6 text-slate-700">{r.comment}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{r.reviewer_name}</span>
            <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden /> Verified patient
          </p>
        </li>
      ))}
    </ul>
  );
}
