"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function submitInvoiceAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireApprovedDoctor();
  const ids = z.array(z.string().uuid()).max(500).safeParse(formData.getAll("appointment_id"));
  if (!ids.success || ids.data.length === 0) return { ok: false, error: "Select at least one consultation." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_invoice", { p_appointments: [...new Set(ids.data)] });
  if (error || !data) return { ok: false, error: friendlyError(error) };
  revalidatePath("/doctor/earnings");
  redirect(`/doctor/invoices/${(data as { id: string }).id}`);
}

export async function withdrawInvoiceAction(formData: FormData) {
  await requireApprovedDoctor();
  const id = z.string().uuid().parse(formData.get("payout_id"));
  const supabase = await createClient();
  await supabase.rpc("withdraw_invoice", { p_payout: id });
  revalidatePath("/doctor/earnings");
  revalidatePath(`/doctor/invoices/${id}`);
}
