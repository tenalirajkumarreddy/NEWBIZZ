import {
  listShiftTemplates,
  listPayMappings,
  listPayConfigs,
  listActiveUsers,
} from "@/lib/data/payroll";
import { SettingsPanel } from "@/components/payroll/SettingsPanel";

export async function SettingsTab({ canManage }: { canManage: boolean }) {
  const [shiftTemplates, payMappings, payConfigs, users] = await Promise.all([
    listShiftTemplates(),
    listPayMappings(),
    listPayConfigs(),
    listActiveUsers(),
  ]);

  return (
    <SettingsPanel
      shiftTemplates={shiftTemplates}
      payMappings={payMappings}
      payConfigs={payConfigs}
      users={users}
      canManage={canManage}
    />
  );
}
