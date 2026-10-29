import Link from "next/link";
import { Suspense } from "react";
import { Stethoscope, Menu, PhoneCall } from "lucide-react";
import { getViewer, portalPath } from "@/lib/auth/viewer";
import { ButtonLink } from "@/components/ui";

const NAV = [
  { href: "/doctors", label: "Find a doctor" },
  { href: "/specialties", label: "Specialties" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-doctors", label: "For doctors" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Stethoscope className="size-4" aria-hidden />
      </span>
      Docothink
    </Link>
  );
}

async function HeaderAccount() {
  const viewer = await getViewer();
  if (viewer) {
    return (
      <ButtonLink href={portalPath(viewer.role)} size="sm">
        My dashboard
      </ButtonLink>
    );
  }
  return (
    <>
      <ButtonLink href="/login" variant="ghost" size="sm">
        Log in
      </ButtonLink>
      <ButtonLink href="/doctors" size="sm">
        Book a consultation
      </ButtonLink>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur no-print">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="h-8 w-28" />}>
            <HeaderAccount />
          </Suspense>
          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-slate-100" aria-label="Open menu">
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function EmergencyBanner() {
  return (
    <div className="bg-red-50 text-red-900 no-print">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs sm:px-6">
        <PhoneCall className="size-3.5 shrink-0" aria-hidden />
        Not for emergencies. If you need urgent help call <strong>911</strong> (US), <strong>999</strong> (UK) or <strong>112</strong> (India).
      </p>
    </div>
  );
}

export function SiteFooter() {
  const columns = [
    {
      title: "Patients",
      links: [
        ["/doctors", "Find a doctor"],
        ["/specialties", "Specialties"],
        ["/how-it-works", "How it works"],
        ["/pricing", "Pricing"],
        ["/faq", "FAQs"],
      ],
    },
    {
      title: "Health topics",
      links: [
        ["/health/mental-health", "Mental health"],
        ["/health/womens-health", "Women's health"],
        ["/health/child-care", "Child care"],
        ["/health/ayurveda", "Ayurveda"],
      ],
    },
    {
      title: "Company",
      links: [
        ["/about", "About us"],
        ["/for-doctors", "Join as a doctor"],
        ["/contact", "Contact"],
      ],
    },
    {
      title: "Legal",
      links: [
        ["/legal/privacy", "Privacy policy"],
        ["/legal/terms", "Terms and conditions"],
        ["/legal/medical-disclaimer", "Medical disclaimer"],
      ],
    },
  ];
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50 no-print">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-slate-600">Verified doctors by chat, audio and video, in your time zone.</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="text-sm font-semibold text-slate-900">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-600 hover:text-slate-900">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          Online consultations don&apos;t replace emergency care or every in-person examination. Doctors are independent
          registered practitioners and are responsible for their clinical decisions.
        </p>
      </div>
    </footer>
  );
}
