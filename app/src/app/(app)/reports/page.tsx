import { getProfitAndLoss, getBalanceSheet, getCashFlow } from "@/lib/data/reports";
import { getCurrentFy } from "@/lib/data/fy";
import { ReportsView } from "./ReportsView";

// Financial statements (§5.1) — P&L, Balance Sheet, and an indicative Cash Flow,
// all computed live from the trial balance. Classified by account_type so the
// presentation never depends on the sign of a balance. Rendered client-side as
// tabs; the data is fetched once here on the server.
export default async function ReportsPage() {
  const [pnl, bs, cf, fy] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getCashFlow(),
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
      <ReportsView pnl={pnl} bs={bs} cf={cf} />
    </div>
  );
}
