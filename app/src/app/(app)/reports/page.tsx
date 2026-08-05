import {
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlow,
  getMonthlyPnlTrend,
  getAnalyticsRatios,
  getArAgingView,
} from "@/lib/data/reports";
import { getCurrentFy } from "@/lib/data/fy";
import { ReportsView } from "./ReportsView";

// Financial statements (§5.1) + analytics (§5.2) — P&L, Balance Sheet, Cash
// Flow, and a trends/ratios view, all computed live from the trial balance.
// The statements classify by account_type so presentation never depends on the
// sign of a balance. Data is fetched once here on the server, then rendered
// client-side as tabs.
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
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Financial Statements</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {fy ? `FY ${fy.code}` : "FY —"} · computed from the trial balance
        </p>
      </div>
      <ReportsView pnl={pnl} bs={bs} cf={cf} trend={trend} ratios={ratios} aging={aging} />
    </div>
  );
}
