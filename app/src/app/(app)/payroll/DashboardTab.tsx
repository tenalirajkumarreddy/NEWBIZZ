import {
  listShiftTemplates,
  listPayrollPeople,
  getCalendarDays,
} from "@/lib/data/payroll";
import { DashboardClient } from "./DashboardClient";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function DashboardTab({
  monthParam,
  canManage,
}: {
  monthParam: string | undefined;
  canManage: boolean;
}) {
  const month = monthParam ?? currentMonth();
  const yr = Number(month.slice(0, 4));
  const mo = Number(month.slice(5, 7));

  const [shiftTemplates, activeUsers, calendarDays] = await Promise.all([
    listShiftTemplates(),
    listPayrollPeople(),
    getCalendarDays(yr, mo),
  ]);

  return (
    <DashboardClient
      year={yr}
      month={mo}
      shiftTemplates={shiftTemplates}
      activeUsers={activeUsers}
      calendarDays={calendarDays}
      canManage={canManage}
    />
  );
}
