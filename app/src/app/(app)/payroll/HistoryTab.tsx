import { getPayrollLog } from "@/lib/data/payroll";
import { PayrollLog } from "./PayrollLog";

export async function HistoryTab() {
  const log = await getPayrollLog();
  return <PayrollLog log={log} />;
}
