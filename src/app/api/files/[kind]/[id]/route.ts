import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Secure file access. The row is read with the viewer's own client, so RLS decides access
 * (patient, treating/shared doctor, clinical.read admin; credentials: owner or doctors.manage).
 * Only then is a 60-second signed URL issued, and the access is written to the audit log.
 */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/files/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer || !viewer.isActive) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createClient();
  const table = kind === "documents" ? "medical_documents" : kind === "credentials" ? "doctor_credentials" : null;
  if (!table) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: row } = await supabase.from(table).select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = createAdminClient();
  const bucket = kind === "documents" ? "medical-documents" : "doctor-credentials";
  const { data: signed } = await admin.storage.from(bucket).createSignedUrl(row.storage_path, 60, { download: row.file_name });
  if (!signed) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  await admin.rpc("audit_as", {
    p_actor: viewer.id,
    p_action: kind === "documents" ? "document.view" : "credential.view",
    p_entity_type: table,
    p_entity_id: id,
    p_metadata: {},
  });

  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
