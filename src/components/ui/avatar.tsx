import { cn } from "./index";

const TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
];

/** Up to two initials, ignoring a leading "Dr". */
export function initials(name: string): string {
  const words = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
}

/** Stand-in for a profile photo; the tint is stable for a given name. */
export function InitialsAvatar({ name, size, className }: { name: string; size: number; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", TINTS[Math.abs(hash) % TINTS.length], className)}
    >
      {initials(name)}
    </span>
  );
}
