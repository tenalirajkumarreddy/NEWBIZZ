import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { getTargetsForMonth, listActiveUsers } from "@/lib/data/commissions";
import { TargetEditorSection } from "@/components/commissions/TargetEditorSection";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  const claims = session?.claims ?? null;
  const canManage = claims ? can(claims, "accounting.manage") : false;

  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();

  const [targets, users] = await Promise.all([
    getTargetsForMonth(month),
    listActiveUsers(),
  ]);

  return <TargetEditorSection targets={targets} users={users} canManage={canManage} />;
}
