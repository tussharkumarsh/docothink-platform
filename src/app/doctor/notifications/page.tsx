import { requireRole } from "@/lib/auth/viewer";
import { NotificationsPage } from "@/features/account/components/notifications-page";

export default async function DoctorNotificationsPage() {
  await requireRole("doctor", "/doctor/notifications");
  return <NotificationsPage />;
}
