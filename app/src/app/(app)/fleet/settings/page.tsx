import { listWarehouses } from "@/lib/data/branches";
import { getFleetThresholdsRaw } from "@/lib/data/settings";
import { WarehouseSettingsForm } from "./WarehouseSettingsForm";
import { ThresholdsForm } from "./ThresholdsForm";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Fleet Settings — NEWBIZZ" };

export default async function FleetSettingsPage() {
  const [warehouses, thresholds] = await Promise.all([
    listWarehouses(),
    getFleetThresholdsRaw(),
  ]);

  return (
    <PageContainer width="formSm">
      <PageHeader
        title="Fleet Settings"
        backHref="/fleet"
        backLabel="Fleet"
        subtitle="Configure warehouse locations and detection thresholds for auto-trips and fuel monitoring."
      />

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
    </PageContainer>
  );
}
