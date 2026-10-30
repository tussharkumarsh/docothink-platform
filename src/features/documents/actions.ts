"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/viewer";
import { friendlyError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const MEDICAL_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
const CREDENTIAL_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

type UploadTicket = { ok: true; id: string; signedUrl: string } | { ok: false; error: string };

/** Step 1: validate + register metadata (DB decides the random path), then issue a signed upload URL. */
export async function createMedicalUploadAction(input: {
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  appointmentId?: string;
}): Promise<UploadTicket> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "patient") return { ok: false, error: "Please sign in as a patient." };
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(200),
      category: z.enum(["lab_report", "imaging", "prescription", "discharge_summary", "other"]),
      fileName: z.string().max(255),
      mimeType: z.enum(MEDICAL_TYPES),
      size: z.number().int().positive(),
      appointmentId: z.string().uuid().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Only PDF, JPEG, PNG, WebP or HEIC files are allowed." };
  if (!(await rateLimit("upload", 30, 3600, viewer.id))) return { ok: false, error: friendlyError({ message: "RATE_LIMITED" }) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_document_upload", {
    p_title: parsed.data.title,
    p_category: parsed.data.category,
    p_file_name: parsed.data.fileName,
    p_mime_type: parsed.data.mimeType,
    p_size_bytes: parsed.data.size,
    p_appointment: parsed.data.appointmentId ?? null,
  });
  if (error || !data) return { ok: false, error: friendlyError(error) };
  const doc = data as { id: string; storage_path: string };
  const { data: signed, error: signError } = await createAdminClient().storage.from("medical-documents").createSignedUploadUrl(doc.storage_path);
  if (signError || !signed) return { ok: false, error: "Upload storage is unavailable. Please try again." };
  return { ok: true, id: doc.id, signedUrl: signed.signedUrl };
}

/** Step 3: confirm the object really exists before marking the document available. */
export async function confirmMedicalUploadAction(documentId: string): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: doc } = await supabase.from("medical_documents").select("storage_path, size_bytes").eq("id", documentId).eq("patient_id", viewer.id).maybeSingle();
  if (!doc) return { ok: false, error: "Upload not found." };
  const folder = doc.storage_path.split("/")[0];
  const name = doc.storage_path.split("/")[1];
  const { data: objects } = await createAdminClient().storage.from("medical-documents").list(folder, { search: name, limit: 1 });
  if (!objects?.some((o) => o.name === name)) return { ok: false, error: "The file didn't finish uploading. Please try again." };
  await supabase.rpc("confirm_document_upload", { p_document: documentId });
  revalidatePath("/patient/reports");
  return { ok: true };
}

export async function deleteMedicalDocumentAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("document_id"));
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("delete_medical_document", { p_document: id });
  if (!error && typeof path === "string") {
    await createAdminClient().storage.from("medical-documents").remove([path]);
  }
  revalidatePath("/patient/reports");
}

export async function createCredentialUploadAction(input: { kind: string; fileName: string; mimeType: string; size: number }): Promise<UploadTicket> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "doctor") return { ok: false, error: "Please sign in as a doctor." };
  const parsed = z
    .object({
      kind: z.enum(["medical_degree", "registration_certificate", "identity_document", "other", "bank_proof"]),
      fileName: z.string().max(255),
      mimeType: z.enum(CREDENTIAL_TYPES),
      size: z.number().int().positive().max(10 * 1024 * 1024),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Upload a PDF, JPEG or PNG up to 10 MB." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_credential_upload", {
    p_kind: parsed.data.kind,
    p_file_name: parsed.data.fileName,
    p_mime_type: parsed.data.mimeType,
    p_size_bytes: parsed.data.size,
  });
  if (error || !data) return { ok: false, error: friendlyError(error) };
  const cred = data as { id: string; storage_path: string };
  const { data: signed } = await createAdminClient().storage.from("doctor-credentials").createSignedUploadUrl(cred.storage_path);
  if (!signed) return { ok: false, error: "Upload storage is unavailable." };
  return { ok: true, id: cred.id, signedUrl: signed.signedUrl };
}

export async function deleteCredentialAction(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("credential_id"));
  const supabase = await createClient();
  // RLS allows deleting only own, pending credentials while the application is editable.
  const { data } = await supabase.from("doctor_credentials").delete().eq("id", id).select("storage_path");
  if (data?.[0]) await createAdminClient().storage.from("doctor-credentials").remove([data[0].storage_path]);
  revalidatePath("/doctor/onboarding");
}
