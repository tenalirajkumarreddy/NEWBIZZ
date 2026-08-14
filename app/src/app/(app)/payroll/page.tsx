import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { Tabs } from "@/components/payroll/Tabs";
import { DashboardTab } from "./DashboardTab";
import { WorkersTab } from "./WorkersTab";
import { SettingsTab } from "./SettingsTab";
import type { TabId } from "@/components/payroll/Tabs";
import { PageContainer, PageHeader } from "@/components/ui";

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
    <PageContainer width="wide">
      <PageHeader title="Attendance & Payroll" />
      <Tabs active={tab} />
      {tab === "dashboard" && <DashboardTab monthParam={monthParam} canManage={canManage} />}
      {tab === "workers" && <WorkersTab canManage={canManage} />}
      {tab === "settings" && <SettingsTab canManage={canManage} />}
    </PageContainer>
  );
}
