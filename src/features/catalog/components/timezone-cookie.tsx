"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Remembers the browser's IANA zone in a cookie so server-rendered pages can show times in the
 * visitor's zone. Purely a display preference; signed-in users' saved zone takes precedence.
 */
export function TimezoneCookie({ current }: { current?: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);
  return null;
}
