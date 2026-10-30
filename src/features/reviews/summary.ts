export type Stars = 1 | 2 | 3 | 4 | 5;
export type RatingDistribution = { counts: Record<Stars, number>; total: number };

/** How many reviews gave each star level (1–5); anything else is ignored. */
export function ratingDistribution(ratings: number[]): RatingDistribution {
  const counts: Record<Stars, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  for (const r of ratings) {
    if (Number.isInteger(r) && r >= 1 && r <= 5) {
      counts[r as Stars] += 1;
      total += 1;
    }
  }
  return { counts, total };
}
