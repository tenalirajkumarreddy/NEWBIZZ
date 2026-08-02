import { listNotifications, getNotificationPrefs } from "@/lib/data/notifications";
import { NotificationsPage } from "./NotificationsPage";
import { NotificationPrefsPanel } from "./NotificationPrefsPanel";

export const metadata = { title: "Notifications — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function NotificationsRoute() {
  const [{ rows, total }, prefs] = await Promise.all([
    listNotifications({ limit: 50 }),
    getNotificationPrefs(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Notifications</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Your inbox — order, invoice, stock and system events.</p>
        </div>
      </div>
      <NotificationsPage rows={rows} total={total} hasMore={total > 50} />
      <NotificationPrefsPanel prefs={prefs} />
    </div>
  );
}
