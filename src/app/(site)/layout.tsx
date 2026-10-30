import { Suspense } from "react";
import { EmergencyBanner, SiteFooter, SiteHeader } from "@/components/layout/site-chrome";
import { DemoNotice } from "@/components/layout/demo-notice";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EmergencyBanner />
      <SiteHeader />
      <Suspense fallback={null}>
        <DemoNotice />
      </Suspense>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
