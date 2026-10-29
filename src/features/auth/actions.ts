"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { portalPath, getViewer } from "@/lib/auth/viewer";
import type { ActionResult } from "@/lib/errors";
import { isValidTimezone } from "@/lib/time/format";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: FormDataEntryValue | null | undefined, fallback = "/"): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}

function notConfigured(): ActionResult {
  return { ok: false, error: "Sign-in is not available yet: Supabase is not configured for this deployment." };
}

export async function signInAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await rateLimit("login", 10, 300, parsed.data.email))) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password (no account enumeration).
    return { ok: false, error: error.code === "email_not_confirmed" ? "Please verify your email first. Check your inbox for the link." : "Incorrect email or password." };
  }
  const viewer = await getViewer();
  redirect(safeNext(formData.get("next"), viewer ? portalPath(viewer.role) : "/"));
}

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(200),
  email,
  password,
  timezone: z.string().refine(isValidTimezone, "Choose a valid time zone"),
  accept: z.literal("on", { message: "Please accept the terms and privacy policy" }),
});

async function signUp(formData: FormData, role: "patient" | "doctor"): Promise<ActionResult> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await rateLimit("signup", 5, 3600))) return { ok: false, error: "Too many sign-ups from this network. Please try later." };

  const supabase = await createClient();
  const next = role === "doctor" ? "/doctor/onboarding" : safeNext(formData.get("next"), "/patient");
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      // Only 'doctor' is honoured by the database trigger, and it grants nothing until approved.
      data: { full_name: parsed.data.full_name, timezone: parsed.data.timezone, signup_role: role === "doctor" ? "doctor" : undefined },
    },
  });
  if (error && error.code !== "user_already_exists") {
    return { ok: false, error: error.code === "weak_password" ? "Choose a stronger password." : "We couldn't create the account. Please try again." };
  }
  // Same response whether or not the email already exists.
  return { ok: true, message: `We've sent a verification link to ${parsed.data.email}. Open it to activate your account.` };
}

export async function signUpPatientAction(_: ActionResult, formData: FormData) {
  return signUp(formData, "patient");
}

export async function signUpDoctorAction(_: ActionResult, formData: FormData) {
  return signUp(formData, "doctor");
}

/** Passwordless sign-in / first-booking account creation. Creates a patient account if needed. */
export async function magicLinkAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = z
    .object({ email, full_name: z.string().trim().max(200).optional(), timezone: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await rateLimit("magic", 5, 900, parsed.data.email))) return { ok: false, error: "Too many requests. Please wait a few minutes." };

  const next = safeNext(formData.get("next"), "/patient");
  const supabase = await createClient();
  const tz = parsed.data.timezone && isValidTimezone(parsed.data.timezone) ? parsed.data.timezone : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { full_name: parsed.data.full_name, timezone: tz },
    },
  });
  if (error) return { ok: false, error: "We couldn't send the link. Please try again shortly." };
  return { ok: true, message: `Check ${parsed.data.email} for a secure sign-in link. It expires in one hour.` };
}

export async function forgotPasswordAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = z.object({ email }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  if (!(await rateLimit("reset", 5, 900, parsed.data.email))) return { ok: false, error: "Too many requests. Please wait a few minutes." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password`,
  });
  return { ok: true, message: "If an account exists for that email, we've sent a password reset link." };
}

export async function resetPasswordAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Your reset link has expired. Request a new one." };
  const viewer = await getViewer();
  redirect(viewer ? portalPath(viewer.role) : "/login");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
