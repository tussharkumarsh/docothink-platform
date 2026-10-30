"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";

const reviewSchema = z.object({
  appointment_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5 stars").max(5, "Choose a rating from 1 to 5 stars"),
  comment: z.string().trim().max(1000, "Please keep your comment under 1,000 characters").optional(),
  anonymous: z.literal("on").optional(),
});

export async function submitReviewAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("patient");
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  // Eligibility (own, completed, within 30 days, once) is enforced by submit_review().
  const { error } = await supabase.rpc("submit_review", {
    p_appointment: parsed.data.appointment_id,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment || null,
    p_anonymous: parsed.data.anonymous === "on",
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(`/patient/appointments/${parsed.data.appointment_id}`);
  revalidateTag("doctors", "max");
  return { ok: true, message: "Thanks for your review. Your comment will appear once it's been checked." };
}
