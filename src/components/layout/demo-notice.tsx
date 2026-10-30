import { cacheLife, cacheTag } from "next/cache";
import { Info } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { demoEnabled } from "./demo-setting";

async function isDemoOn(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");
  if (!isSupabaseConfigured) return false;
  const { data } = await createPublicClient().from("platform_settings").select("value").eq("key", "demo").maybeSingle();
  return demoEnabled(data?.value);
}

/** Shown while demo data exists, so fictional doctors and reviews are never mistaken for real ones. */
export async function DemoNotice() {
  if (!(await isDemoOn())) return null;
  return (
    <div className="bg-amber-50 text-amber-900 no-print">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs sm:px-6">
        <Info className="size-3.5 shrink-0" aria-hidden />
        Demo data: doctors, patients and reviews shown here are fictional and for presentation only.
      </p>
    </div>
  );
}
