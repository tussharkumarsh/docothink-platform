import { CalendarDays, CreditCard, FileHeart, FileText, LayoutDashboard, Pill, Share2, UserRound } from "lucide-react";
import { PortalShell } from "@/components/layout/portal-shell";

const NAV = [
  { href: "/patient", label: "Dashboard", icon: <LayoutDashboard /> },
  { href: "/patient/appointments", label: "Appointments", icon: <CalendarDays /> },
  { href: "/patient/medical-profile", label: "Medical profile", icon: <FileHeart /> },
  { href: "/patient/reports", label: "Medical reports", icon: <FileText /> },
  { href: "/patient/prescriptions", label: "Prescriptions & history", icon: <Pill /> },
  { href: "/patient/payments", label: "Payments", icon: <CreditCard /> },
  { href: "/patient/sharing", label: "Record sharing", icon: <Share2 /> },
  { href: "/patient/profile", label: "Personal details", icon: <UserRound /> },
];

export default function PatientLayout({ children }: LayoutProps<"/patient">) {
  return (
    <PortalShell label="Patient" nav={NAV} notificationsHref="/patient/notifications">
      {children}
    </PortalShell>
  );
}
