/** platform_settings 'demo' is written by supabase/demo/seed-demo.sql and removed by cleanup-demo.sql. */
export function demoEnabled(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { enabled?: unknown }).enabled === true;
}
