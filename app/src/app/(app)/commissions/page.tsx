import { getSession } from "@/lib/auth/session";
import { Kpi } from "@/components/ui";
import { Money } from "@/components/ui/Money";
import { rupeesCompact } from "@/lib/format";
import { getCommissionSummary, getTargetAchievement, listActiveUsers } from "@/lib/data/commissions";
import { AchievementSection } from "@/components/commissions/AchievementSection";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function AchievementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();

  const [summary, achievement, users] = await Promise.all([
    getCommissionSummary(month),
    getTargetAchievement(month),
    listActiveUsers(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-3">
        {users.length} active users · {rupeesCompact(summary.totalTarget)} total target
        {summary.pendingCommission > 0 && ` · ${rupeesCompact(summary.pendingCommission)} pending commission`}
      </p>

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

      <AchievementSection month={month} rows={achievement} />
    </div>
  );
}
