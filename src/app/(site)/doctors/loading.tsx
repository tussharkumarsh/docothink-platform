import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading doctors">
      <Skeleton className="h-9 w-56" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      </div>
    </div>
  );
}
