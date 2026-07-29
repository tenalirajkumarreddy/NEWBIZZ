import { getWorkersWithBalances, listWorkers } from "@/lib/data/payroll";
import { WorkerList } from "@/components/payroll/WorkerList";

export async function WorkersTab({ canManage }: { canManage: boolean }) {
  const [workers, manualWorkers] = await Promise.all([
    getWorkersWithBalances(),
    listWorkers(),
  ]);
  return <WorkerList workers={workers} manualWorkers={manualWorkers} canManage={canManage} />;
}
