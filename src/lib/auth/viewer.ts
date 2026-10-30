import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { AdminPermission, AppRole, DoctorApplicationStatus } from "@/lib/domain";

export type Viewer = {
  id: string;
  email: string;
  role: AppRole;
  fullName: string;
  timezone: string;
  isActive: boolean;
  permissions: AdminPermission[];
  doctorStatus: DoctorApplicationStatus | null;
};

/**
 * Data Access Layer: the one place that turns the session cookie into a verified viewer.
 * getClaims() verifies the JWT; role and permissions always come from the database,
 * never from the token or the browser.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Always a request-time read, so pages that depend on the viewer are never prerendered,
  // even in builds where Supabase isn't configured.
  await connection();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  // One round trip instead of two: the role-specific rows are fetched alongside the profile (RLS limits
  // each to the viewer's own rows) and only the one matching the role is used.
  const [{ data: profile }, { data: perms }, { data: doc }] = await Promise.all([
    supabase.from("profiles").select("id, email, role, full_name, timezone, is_active").eq("id", userId).maybeSingle(),
    supabase.from("admin_permissions").select("permission").eq("user_id", userId),
    supabase.from("doctor_profiles").select("application_status").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile) return null;

  const permissions: AdminPermission[] = profile.role === "admin" ? (perms ?? []).map((p) => p.permission as AdminPermission) : [];
  const doctorStatus: DoctorApplicationStatus | null =
    profile.role === "doctor" ? ((doc?.application_status as DoctorApplicationStatus) ?? null) : null;

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role as AppRole,
    fullName: profile.full_name,
    timezone: profile.timezone,
    isActive: profile.is_active,
    permissions,
    doctorStatus,
  };
});

export function portalPath(role: AppRole): string {
  return role === "admin" ? "/admin" : role === "doctor" ? "/doctor" : "/patient";
}

export function hasPermission(viewer: Viewer, permission: AdminPermission): boolean {
  return viewer.role === "admin" && (viewer.permissions.includes("*") || viewer.permissions.includes(permission));
}

/** For pages and actions: signed in, active, and the right role; otherwise redirect. */
export async function requireRole(role: AppRole, next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!viewer.isActive) redirect("/account-disabled");
  if (viewer.role !== role) redirect(portalPath(viewer.role));
  return viewer;
}

/** Doctors whose application is approved (clinical features). */
export async function requireApprovedDoctor(): Promise<Viewer> {
  const viewer = await requireRole("doctor");
  if (viewer.doctorStatus !== "approved") redirect("/doctor/onboarding");
  return viewer;
}

export async function requirePermission(permission: AdminPermission): Promise<Viewer> {
  const viewer = await requireRole("admin");
  if (!hasPermission(viewer, permission)) redirect("/admin?denied=" + encodeURIComponent(permission));
  return viewer;
}
