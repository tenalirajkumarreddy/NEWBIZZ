import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { listCommissionRuns } from "@/lib/data/commissions";
import { RunsSection } from "@/components/commissions/RunsSection";

export default async function RunsPage() {
  const session = await getSession();
  const claims = session?.claims ?? null;
  const canManage = claims ? can(claims, "accounting.manage") : false;

  const runs = await listCommissionRuns();

  return <RunsSection runs={runs} canManage={canManage} />;
}
