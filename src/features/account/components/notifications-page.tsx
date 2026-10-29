import Link from "next/link";
import { Bell } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsReadAction } from "../actions";
import { formatDateTime } from "@/lib/time/format";

/** Shared notifications page body for all three portals. */
export async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <form action={markNotificationsReadAction}>
            <Button type="submit" variant="secondary" size="sm">Mark all as read</Button>
          </form>
        }
      />
      <Card>
        {!data?.length ? (
          <EmptyState icon={<Bell className="size-6" aria-hidden />} title="You're all caught up" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-brand-50/40"}>
                <div className="flex flex-wrap items-start justify-between gap-2 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-900">{n.title}</p>
                    {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(n.created_at, viewer.timezone, { withZone: false })}</p>
                  </div>
                  {n.link && <Link href={n.link} className="text-sm font-medium text-brand-700 hover:underline">Open</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
