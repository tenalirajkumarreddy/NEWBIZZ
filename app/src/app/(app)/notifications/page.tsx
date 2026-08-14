import { listNotifications, getNotificationPrefs } from "@/lib/data/notifications";
import { NotificationsPage } from "./NotificationsPage";
import { NotificationPrefsDrawer } from "./NotificationPrefsDrawer";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Notifications — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function NotificationsRoute() {
  const [{ rows, total }, prefs] = await Promise.all([
    listNotifications({ limit: 50 }),
    getNotificationPrefs(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Notifications"
        subtitle="Your inbox — order, invoice, stock and system events."
        actions={<NotificationPrefsDrawer prefs={prefs} />}
      />
      <NotificationsPage rows={rows} total={total} hasMore={total > 50} />
    </PageContainer>
  );
}
