import { requireRole } from "@/lib/auth/viewer";
import { NotificationsPage } from "@/features/account/components/notifications-page";

export default async function PatientNotificationsPage() {
  await requireRole("patient", "/patient/notifications");
  return <NotificationsPage />;
}
