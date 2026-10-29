"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The browser's IANA zone; "UTC" during server render, then the real zone after hydration. */
export function useBrowserTimezone(): string {
  return useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
}
