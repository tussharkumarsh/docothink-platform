import { requireRole } from "@/lib/auth/viewer";
import { NotificationsPage } from "@/features/account/components/notifications-page";

export default async function AdminNotificationsPage() {
  await requireRole("admin", "/admin/notifications");
  return <NotificationsPage />;
}
