import Link from "next/link";
import { listWarehouses } from "@/lib/data/branches";
import { getFleetThresholdsRaw } from "@/lib/data/settings";
import { WarehouseSettingsForm } from "./WarehouseSettingsForm";
import { ThresholdsForm } from "./ThresholdsForm";

export const metadata = { title: "Fleet Settings — NEWBIZZ" };

export default async function FleetSettingsPage() {
  const [warehouses, thresholds] = await Promise.all([
    listWarehouses(),
    getFleetThresholdsRaw(),
  ]);

  return (
    <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-6 py-6 lg:px-8">
      <Link href="/fleet" className="text-[13px] text-link hover:underline">← Fleet</Link>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Fleet Settings</h1>
      <p className="text-[13px] text-ink-3">
        Configure warehouse locations and detection thresholds for auto-trips and fuel monitoring.
      </p>

      {warehouses.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-6 text-center text-[13px] text-ink-3">
          No warehouses found. Mark a branch as warehouse in branch settings first.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {warehouses.map((w) => (
            <WarehouseSettingsForm key={w.id} branch={w} />
          ))}
        </div>
      )}

      <ThresholdsForm thresholds={thresholds} />
    </div>
  );
}
