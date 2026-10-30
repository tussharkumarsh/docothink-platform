import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Temporal } from "temporal-polyfill";
import { createAdminClient, createPublicClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import { generateSlots, type AvailabilityRule, type Slot } from "@/lib/time/slots";
import type { ConsultationMode } from "@/lib/domain";

export type Specialty = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_path: string | null;
};

export type DoctorCard = {
  user_id: string;
  slug: string;
  title: string;
  display_name: string;
  headline: string | null;
  qualifications: string | null;
  years_experience: number | null;
  languages: string[];
  country: string | null;
  timezone: string;
  currency: string;
  fee_chat: number | null;
  fee_audio: number | null;
  fee_video: number | null;
  photo_path: string | null;
  is_accepting_bookings: boolean;
  rating_avg: number | null;
  rating_count: number;
  is_demo: boolean;
  specialties: { slug: string; name: string; is_primary: boolean }[];
};

export type DoctorDetail = DoctorCard & {
  bio: string | null;
  registration_number: string | null;
  registration_council: string | null;
  registration_country: string | null;
  education: { degree: string; institution: string; year?: number }[];
  experience: { position: string; organization: string; years?: string }[];
  booking_horizon_days: number;
  min_notice_minutes: number;
  approved_at: string | null;
  special_interests: string[];
  services: string[];
  skills: string[];
  awards: { title: string; organization?: string; year?: number }[];
  memberships: { organization: string; role?: string; since?: number }[];
  publications: { title: string; journal?: string; year?: number; url?: string }[];
  practice_started_year: number | null;
};

const CARD_COLUMNS =
  "user_id, slug, title, display_name, headline, qualifications, years_experience, languages, country, timezone, currency, fee_chat, fee_audio, fee_video, photo_path, is_accepting_bookings, rating_avg, rating_count, is_demo, doctor_specialties(is_primary, specialties(slug, name))";

type RawSpecialtyLink = { is_primary: boolean; specialties: { slug: string; name: string } | null };

function mapCard<T extends { doctor_specialties?: RawSpecialtyLink[] }>(row: T) {
  const { doctor_specialties, ...rest } = row;
  return {
    ...rest,
    specialties: (doctor_specialties ?? [])
      .filter((l) => l.specialties)
      .map((l) => ({ slug: l.specialties!.slug, name: l.specialties!.name, is_primary: l.is_primary }))
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
  };
}

export async function getSpecialties(): Promise<Specialty[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("specialties");
  if (!isSupabaseConfigured) return [];
  const { data, error } = await createPublicClient()
    .from("specialties")
    .select("id, slug, name, description, icon_path")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error("Could not load specialties");
  return data ?? [];
}

export async function getConditions(): Promise<{ slug: string; name: string; specialty_slug: string | null }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("specialties");
  if (!isSupabaseConfigured) return [];
  const { data } = await createPublicClient()
    .from("conditions")
    .select("slug, name, specialties(slug)")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((c) => ({
    slug: c.slug,
    name: c.name,
    specialty_slug: (c.specialties as unknown as { slug: string } | null)?.slug ?? null,
  }));
}

export type DoctorFilters = {
  specialty?: string;
  mode?: ConsultationMode;
  language?: string;
  country?: string;
  currency?: string;
  maxFee?: number;
  minExperience?: number;
  q?: string;
};

export async function searchDoctors(filters: DoctorFilters): Promise<DoctorCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("doctors");
  if (!isSupabaseConfigured) return [];

  let query = createPublicClient()
    .from("doctor_profiles")
    .select(filters.specialty ? CARD_COLUMNS.replace("doctor_specialties(", "doctor_specialties!inner(") : CARD_COLUMNS)
    .eq("application_status", "approved")
    .order("years_experience", { ascending: false, nullsFirst: false });

  if (filters.specialty) query = query.eq("doctor_specialties.specialties.slug", filters.specialty);
  if (filters.mode) query = query.not(`fee_${filters.mode}`, "is", null);
  if (filters.language) query = query.contains("languages", [filters.language]);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.minExperience) query = query.gte("years_experience", filters.minExperience);
  if (filters.q) query = query.ilike("display_name", `%${filters.q.replace(/[%_,()]/g, "")}%`);
  if (filters.currency && filters.maxFee != null) {
    const col = `fee_${filters.mode ?? "video"}`;
    query = query.eq("currency", filters.currency).lte(col, filters.maxFee);
  }

  const { data, error } = await query.limit(100);
  if (error) throw new Error("Could not load doctors");
  // With the !inner specialty filter, each card lists only the matching specialty, which is what the filtered view shows.
  const rows = data as unknown as (Omit<DoctorCard, "specialties"> & { doctor_specialties: RawSpecialtyLink[] })[];
  return rows.map(mapCard).filter((d) => !filters.specialty || d.specialties.length > 0) as DoctorCard[];
}

export async function getFeaturedDoctors(): Promise<DoctorCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("doctors");
  const all = await searchDoctors({});
  return all.slice(0, 4);
}

/**
 * Completed consultations, for the public stats band. Appointments aren't readable with the public
 * key, so this counts with the server-only admin client and returns null when it isn't configured.
 */
export async function getCompletedConsultationCount(): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("stats");
  if (!isSupabaseConfigured || !serverEnv().supabaseSecretKey) return null;
  const { count, error } = await createAdminClient()
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");
  return error ? null : count;
}

export async function getDoctorBySlug(slug: string): Promise<DoctorDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("doctors", `doctor:${slug}`);
  if (!isSupabaseConfigured) return null;
  const { data } = await createPublicClient()
    .from("doctor_profiles")
    .select(
      `${CARD_COLUMNS}, bio, registration_number, registration_council, registration_country, education, experience, booking_horizon_days, min_notice_minutes, approved_at, special_interests, services, skills, awards, memberships, publications, practice_started_year`,
    )
    .eq("slug", slug)
    .eq("application_status", "approved")
    .maybeSingle();
  return data ? (mapCard(data as never) as unknown as DoctorDetail) : null;
}

/**
 * Live, bookable slots (UTC). Not cached: depends on now and on other patients' bookings.
 * Busy intervals come from a SECURITY DEFINER function that returns times only.
 */
export async function getDoctorSlots(
  doctor: Pick<DoctorDetail, "user_id" | "timezone" | "booking_horizon_days" | "min_notice_minutes">,
  mode?: ConsultationMode,
): Promise<Slot[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = createPublicClient();
  const now = Temporal.Now.instant();
  const { data: settings } = await supabase.from("platform_settings").select("value").eq("key", "booking").maybeSingle();
  const maxHorizon = Number((settings?.value as { max_horizon_days?: number } | null)?.max_horizon_days ?? 30);
  const horizonDays = Math.min(doctor.booking_horizon_days, maxHorizon);

  const [{ data: rules }, { data: busy }] = await Promise.all([
    supabase
      .from("doctor_availability_rules")
      .select("weekday, start_time, end_time, timezone, slot_minutes, buffer_minutes, modes")
      .eq("doctor_id", doctor.user_id)
      .eq("is_active", true),
    supabase.rpc("get_doctor_busy_intervals", {
      p_doctor: doctor.user_id,
      p_from: now.subtract({ hours: 24 }).toString(),
      p_to: now.add({ hours: 24 * (horizonDays + 2) }).toString(),
    }),
  ]);

  return generateSlots({
    rules: (rules ?? []).map(
      (r): AvailabilityRule => ({
        weekday: r.weekday,
        startTime: r.start_time,
        endTime: r.end_time,
        timezone: r.timezone,
        slotMinutes: r.slot_minutes,
        bufferMinutes: r.buffer_minutes,
        modes: r.modes,
      }),
    ),
    busy: ((busy as { starts_at: string; ends_at: string }[]) ?? []).map((b) => ({ start: b.starts_at, end: b.ends_at })),
    doctorTimezone: doctor.timezone,
    horizonDays,
    minNoticeMinutes: doctor.min_notice_minutes,
    now,
    mode,
  });
}

export function photoUrl(path: string | null): string {
  if (!path) return "/default-doctor.jpg";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}
