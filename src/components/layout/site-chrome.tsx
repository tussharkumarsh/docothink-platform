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
    <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-slate-900">
      <span className="flex size-7 items-center justify-center rounded-[9px] bg-linear-to-b from-brand-500 to-brand-700 text-white shadow-sm">
        <Stethoscope className="size-3.5" aria-hidden />
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
    <header className="glass sticky top-0 z-30 border-b border-black/6 no-print">
      <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-[13px] text-slate-700 transition-colors hover:text-slate-950">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="h-8 w-28" />}>
            <HeaderAccount />
          </Suspense>
          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full hover:bg-black/5" aria-label="Open menu">
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav aria-label="Mobile" className="glass absolute right-0 mt-2 w-60 rounded-2xl p-2 shadow-card ring-1 ring-black/6">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-xl px-3 py-2.5 text-[15px] text-slate-800 hover:bg-black/5">
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
    <div className="bg-slate-50 text-slate-600 no-print">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:px-6">
        <PhoneCall className="size-3.5 shrink-0 text-red-600" aria-hidden />
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
    <footer className="mt-auto bg-slate-50 no-print">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="space-y-3">
          <Logo />
          <p className="text-xs leading-5 text-slate-500">Verified doctors by chat, audio and video, in your time zone.</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="text-xs font-semibold text-slate-800">{col.title}</h2>
            <ul className="mt-3 space-y-2.5">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-slate-500 transition-colors hover:text-slate-900 hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="border-t border-slate-200 py-6 text-xs leading-5 text-slate-500">
          Online consultations don&apos;t replace emergency care or every in-person examination. Doctors are independent
          registered practitioners and are responsible for their clinical decisions.
        </p>
      </div>
    </footer>
  );
}
