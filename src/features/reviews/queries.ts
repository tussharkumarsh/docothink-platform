import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { ratingDistribution, type RatingDistribution } from "./summary";

export type PublicReview = { id: string; rating: number; comment: string | null; reviewer_name: string; created_at: string };

/** Latest reviews with an approved comment, from the public view (never exposes patient ids). */
export async function getDoctorReviews(doctorId: string, limit = 10): Promise<PublicReview[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("doctors", `reviews:${doctorId}`);
  if (!isSupabaseConfigured) return [];
  const { data } = await createPublicClient()
    .from("public_doctor_reviews")
    .select("id, rating, comment, reviewer_name, created_at")
    .eq("doctor_id", doctorId)
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRatingDistribution(doctorId: string): Promise<RatingDistribution> {
  "use cache";
  cacheLife("minutes");
  cacheTag("doctors", `reviews:${doctorId}`);
  if (!isSupabaseConfigured) return ratingDistribution([]);
  const { data } = await createPublicClient().from("public_doctor_reviews").select("rating").eq("doctor_id", doctorId).limit(5000);
  return ratingDistribution((data ?? []).map((r) => r.rating));
}
