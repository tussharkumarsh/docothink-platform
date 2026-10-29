import { CalendarDays, ClipboardList, LayoutDashboard, Landmark, ListTree, ScrollText, Settings, Stethoscope, Users } from "lucide-react";
import { PortalShell } from "@/components/layout/portal-shell";

const NAV = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard /> },
  { href: "/admin/doctors", label: "Doctors", icon: <Stethoscope /> },
  { href: "/admin/patients", label: "Patients", icon: <Users /> },
  { href: "/admin/appointments", label: "Appointments", icon: <CalendarDays /> },
  { href: "/admin/appointments/change-requests", label: "Reschedule requests", icon: <ClipboardList /> },
  { href: "/admin/finance", label: "Finance & payouts", icon: <Landmark /> },
  { href: "/admin/specialties", label: "Specialties", icon: <ListTree /> },
  { href: "/admin/settings", label: "Platform settings", icon: <Settings /> },
  { href: "/admin/audit", label: "Audit log", icon: <ScrollText /> },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <PortalShell label="Admin" nav={NAV} notificationsHref="/admin/notifications">
      {children}
    </PortalShell>
  );
}
