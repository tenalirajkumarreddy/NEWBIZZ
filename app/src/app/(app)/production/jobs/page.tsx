import { listJobCards } from "@/lib/data/production";
import { listDeviceConfigs } from "@/lib/data/production-devices";
import { listItems } from "@/lib/data/catalog";
import { listUsers } from "@/lib/data/users";
import { todayIST } from "@/lib/data/fy";
import { PageContainer, PageHeader } from "@/components/ui";
import { JobBoardView } from "./JobBoardView";

export const metadata = { title: "Production Jobs — NEWBIZZ" };

export default async function JobsPage() {
  const [cards, devices, items, users] = await Promise.all([
    listJobCards(),
    listDeviceConfigs(),
    listItems({ limit: 2000 }),
    listUsers(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Production Jobs"
        subtitle={`Plan the day&apos;s jobs. Completing a job posts a production run from its card.`}
        backHref="/production"
        backLabel="Production Runs"
      />
      <JobBoardView
        cards={cards}
        devices={devices.map((d) => ({ id: d.id, deviceId: d.deviceId, itemId: d.itemId }))}
        items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, type: i.type }))}
        users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
        today={todayIST()}
      />
    </PageContainer>
  );
}
