import {
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlow,
  getMonthlyPnlTrend,
  getAnalyticsRatios,
  getArAgingView,
} from "@/lib/data/reports";
import { getCurrentFy } from "@/lib/data/fy";
import { PageContainer, PageHeader } from "@/components/ui";
import { ReportsView } from "./ReportsView";

// Financial statements (§5.1) + analytics (§5.2) — P&L, Balance Sheet, Cash
// Flow, and a trends/ratios view, all computed live from the trial balance.
// The statements classify by account_type so presentation never depends on the
// sign of a balance. Data is fetched once here on the server, then rendered
// client-side as tabs.
export const metadata = { title: "Financial Statements — NEWBIZZ" };
export default async function ReportsPage() {
  const [pnl, bs, cf, trend, ratios, aging, fy] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getCashFlow(),
    getMonthlyPnlTrend(),
    getAnalyticsRatios(),
    getArAgingView(),
    getCurrentFy(),
  ]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="Financial Statements"
        subtitle={`${fy ? `FY ${fy.code}` : "FY —"} · computed from the trial balance`}
      />
      <ReportsView pnl={pnl} bs={bs} cf={cf} trend={trend} ratios={ratios} aging={aging} />
    </PageContainer>
  );
}
