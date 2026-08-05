import Link from "next/link";
import { listJobCards } from "@/lib/data/production";
import { listDeviceConfigs } from "@/lib/data/production-devices";
import { listItems } from "@/lib/data/catalog";
import { listUsers } from "@/lib/data/users";
import { todayIST } from "@/lib/data/fy";
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
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/production" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Production Runs
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Production Jobs</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Plan the day&apos;s jobs. Completing a job posts a production run from its card.
        </p>
      </div>
      <JobBoardView
        cards={cards}
        devices={devices.map((d) => ({ id: d.id, deviceId: d.deviceId, itemId: d.itemId }))}
        items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, type: i.type }))}
        users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
        today={todayIST()}
      />
    </div>
  );
}
