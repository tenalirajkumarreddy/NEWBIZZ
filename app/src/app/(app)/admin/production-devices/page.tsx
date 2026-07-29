import { Suspense } from "react";
import { listDeviceConfigs, listItemOptions, getHourlyProduction } from "@/lib/data/production-devices";
import { Panel } from "@/components/ui/Card";
import { count as fmtCount } from "@/lib/format";
import { DeviceConfigManager } from "./DeviceConfigManager";
import { TimelineView } from "./TimelineView";
import Link from "next/link";

export default async function ProductionDevicesPage({
  searchParams,
}: {
  searchParams: { tab?: string; date?: string };
}) {
  const tab = searchParams.tab === "config" ? "config" : "timeline";
  const date = searchParams.date || new Date().toISOString().slice(0, 10);

  const [configs, items] = await Promise.all([
    listDeviceConfigs(),
    listItemOptions(),
  ]);

  const deviceCount = new Set(configs.map((c) => c.deviceId)).size;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Production Devices</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {fmtCount(configs.length)} mappings · {fmtCount(deviceCount)} device{deviceCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-line">
        <Link
          href="/admin/production-devices"
          className={`px-4 py-2 text-[13px] font-medium transition-colors ${
            tab === "timeline"
              ? "border-b-2 border-brand text-ink"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          Timeline
        </Link>
        <Link
          href="/admin/production-devices?tab=config"
          className={`px-4 py-2 text-[13px] font-medium transition-colors ${
            tab === "config"
              ? "border-b-2 border-brand text-ink"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          Configuration
        </Link>
      </div>

      {tab === "timeline" ? (
        <Suspense fallback={<div className="py-8 text-center text-[13px] text-ink-3">Loading timeline...</div>}>
          <TimelineTab date={date} />
        </Suspense>
      ) : (
        <Panel flush>
          <DeviceConfigManager configs={configs} items={items} />
        </Panel>
      )}
    </div>
  );
}

async function TimelineTab({ date }: { date: string }) {
  const data = await getHourlyProduction(date);
  const totalUnits = data.reduce((sum, r) => sum + r.hours.reduce((a, b) => a + b, 0), 0);

  return (
    <TimelineView
      data={data}
      date={date}
      totalUnits={totalUnits}
    />
  );
}
