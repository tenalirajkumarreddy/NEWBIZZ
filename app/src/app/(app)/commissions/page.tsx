import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { Kpi } from "@/components/ui/Kpi";
import { Money } from "@/components/ui/Money";
import { rupeesCompact } from "@/lib/format";
import { getCommissionSummary, getTargetAchievement, listCommissionRuns, listCommissionRules, getTargetsForMonth, listActiveUsers, listRoles } from "@/lib/data/commissions";
import { AchievementSection } from "@/components/commissions/AchievementSection";
import { RunsSection } from "@/components/commissions/RunsSection";
import { RulesSection } from "@/components/commissions/RulesSection";
import { TargetEditorSection } from "@/components/commissions/TargetEditorSection";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  const claims = session?.claims ?? null;
  const canManage = claims ? can(claims, "accounting.manage") : false;
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();

  const [summary, achievement, runs, rules, targets, users, roles] = await Promise.all([
    getCommissionSummary(month),
    getTargetAchievement(month),
    listCommissionRuns(),
    listCommissionRules(),
    getTargetsForMonth(month),
    listActiveUsers(),
    listRoles(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Targets & Commissions</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {users.length} active users · {rupeesCompact(summary.totalTarget)} total target
            {summary.pendingCommission > 0 && ` · ${rupeesCompact(summary.pendingCommission)} pending commission`}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total Target" value={<Money value={summary.totalTarget} compact />} />
        <Kpi
          label="Achievement"
          value={<Money value={summary.totalAchieved} compact />}
          sub={`${summary.achievementPct?.toFixed(1) ?? "—"}% of target`}
          tone={summary.achievementPct !== null && summary.achievementPct >= 80 ? "grn" : summary.achievementPct !== null && summary.achievementPct >= 50 ? undefined : "amb"}
        />
        <Kpi
          label="Achievement %"
          value={summary.achievementPct !== null ? `${summary.achievementPct.toFixed(1)}%` : "—"}
          sub={summary.achievementPct !== null && summary.totalTarget > 0 ? `${rupeesCompact(summary.totalTarget - summary.totalAchieved)} gap` : undefined}
          tone={summary.achievementPct !== null && summary.achievementPct >= 80 ? "grn" : summary.achievementPct !== null && summary.achievementPct >= 50 ? undefined : "amb"}
        />
        <Kpi
          label="Pending Commission"
          value={<Money value={summary.pendingCommission} compact />}
        />
      </div>

      {/* Achievement table */}
      <AchievementSection month={month} rows={achievement} />

      {/* Secondary sections */}
      <div className="flex flex-col gap-2">
        <RunsSection runs={runs} canManage={canManage} />
        <RulesSection rules={rules} users={users} roles={roles} canManage={canManage} />
        <TargetEditorSection targets={targets} users={users} canManage={canManage} />
      </div>
    </div>
  );
}
