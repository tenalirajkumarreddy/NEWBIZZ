import { listPayrollRuns, getWagesSummary } from "@/lib/data/payroll";
import { PayrollClient } from "./PayrollClient";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function PayrollTab({
  monthParam,
  canManage,
}: {
  monthParam: string | undefined;
  canManage: boolean;
}) {
  const month = monthParam ?? currentMonth();
  const [runs, summary] = await Promise.all([listPayrollRuns(), getWagesSummary(month)]);

  return <PayrollClient month={month} runs={runs} summary={summary} canManage={canManage} />;
}
