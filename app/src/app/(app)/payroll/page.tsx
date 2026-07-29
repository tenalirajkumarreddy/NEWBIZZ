import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { Tabs } from "@/components/payroll/Tabs";
import { DashboardTab } from "./DashboardTab";
import { WorkersTab } from "./WorkersTab";
import { SettingsTab } from "./SettingsTab";
import type { TabId } from "@/components/payroll/Tabs";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const session = await getSession();
  const claims = session?.claims ?? null;
  const canManage = claims ? can(claims, "hr.manage") : false;
  const { tab: tabParam, month: monthParam } = await searchParams;
  const tab = (tabParam as TabId) || "dashboard";

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Attendance & Payroll</h1>
      <Tabs active={tab} />
      {tab === "dashboard" && <DashboardTab monthParam={monthParam} canManage={canManage} />}
      {tab === "workers" && <WorkersTab canManage={canManage} />}
      {tab === "settings" && <SettingsTab canManage={canManage} />}
    </div>
  );
}
