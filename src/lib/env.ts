/**
 * Environment access. Public values are inlined by Next at build time (NEXT_PUBLIC_*);
 * server values are read lazily so missing optional integrations degrade to "unconfigured"
 * instead of crashing the app.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Supabase's current publishable key, falling back to the legacy anon key name.
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);

export function serverEnv() {
  return {
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "resend" | "console",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "Docothink <no-reply@example.com>",
    cronSecret: process.env.CRON_SECRET ?? "",
    stunUrls: (process.env.WEBRTC_STUN_URLS ?? "stun:stun.l.google.com:19302")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    turnUrls: (process.env.WEBRTC_TURN_URLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    turnSecret: process.env.WEBRTC_TURN_SECRET ?? "",
    turnUsername: process.env.WEBRTC_TURN_USERNAME ?? "",
    turnCredential: process.env.WEBRTC_TURN_CREDENTIAL ?? "",
  };
}
