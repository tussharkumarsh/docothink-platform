/** "Which doctor do I need?" guide: maps selected concerns to a specialty. A routing aid, never a diagnosis. */

/** Specialties that also see children; anything else is routed to Pediatrics for a child. */
export const CHILD_SAFE = ["pediatrics", "dermatology", "ent", "ophthalmology", "dentistry", "psychiatry"] as const;

export const SAFETY_NOTE =
  "This guide suggests a specialty; it isn't a diagnosis. If symptoms are severe or sudden (chest pain, difficulty breathing, signs of stroke), call 911 (US), 999 (UK) or 112 (India) now.";

/** The most common specialty among the selected concerns (ties: the first selected wins). */
export function suggestSpecialty(selected: { slug: string; specialty_slug: string | null }[], forChild: boolean): string | null {
  const counts = new Map<string, number>();
  for (const s of selected) if (s.specialty_slug) counts.set(s.specialty_slug, (counts.get(s.specialty_slug) ?? 0) + 1);
  let best: string | null = null;
  for (const [slug, n] of counts) if (best === null || n > counts.get(best)!) best = slug; // Map keeps insertion order
  if (best && forChild && !(CHILD_SAFE as readonly string[]).includes(best)) return "pediatrics";
  return best;
}
