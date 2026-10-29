import { CalendarClock, CalendarDays, ClipboardCheck, LayoutDashboard, UserRound, Users, Wallet } from "lucide-react";
import { PortalShell } from "@/components/layout/portal-shell";

const NAV = [
  { href: "/doctor", label: "Dashboard", icon: <LayoutDashboard /> },
  { href: "/doctor/appointments", label: "Appointments", icon: <CalendarDays /> },
  { href: "/doctor/availability", label: "Availability", icon: <CalendarClock /> },
  { href: "/doctor/patients", label: "Patients", icon: <Users /> },
  { href: "/doctor/earnings", label: "Earnings", icon: <Wallet /> },
  { href: "/doctor/profile", label: "Profile & fees", icon: <UserRound /> },
  { href: "/doctor/onboarding", label: "Verification", icon: <ClipboardCheck /> },
];

export default function DoctorLayout({ children }: LayoutProps<"/doctor">) {
  return (
    <PortalShell label="Doctor" nav={NAV} notificationsHref="/doctor/notifications">
      {children}
    </PortalShell>
  );
}
