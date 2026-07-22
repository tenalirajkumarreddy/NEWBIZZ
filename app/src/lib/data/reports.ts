// =====================================================================
// lib/data/reports.ts — financial statements computed live from the trial
// balance (§5.1). The TB comes from get_trial_balance (mv_trial_balance, backed
// by journal_lines — Invariant 1). We classify by account_type, never by the
// sign of the balance, so a supplier advance stays under Liabilities.
// =====================================================================
import "server-only";
import { getTrialBalance } from "./accounting";
import type { TrialBalanceRow, AccountType } from "./types";

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  /** Signed amount in the statement's natural presentation (see below). */
  amount: number;
}

export interface StatementSection {
  label: string;
  lines: StatementLine[];
  total: number;
}

// Trial-balance `balance` is debit-positive (Dr − Cr). For presentation:
//   assets/expenses are naturally debit → show balance as-is
//   liabilities/equity/income are naturally credit → show −balance (credit +ve)
function presented(row: TrialBalanceRow): number {
  const bal = Number(row.balance ?? 0);
  const t = row.account_type;
  if (t === "asset" || t === "expense") return bal;
  return -bal;
}

function toLine(row: TrialBalanceRow): StatementLine {
  return {
    accountId: row.account_id ?? "",
    code: row.account_code ?? "",
    name: row.account_name ?? "—",
    type: (row.account_type ?? "asset") as AccountType,
    amount: presented(row),
  };
}

export interface ProfitAndLoss {
  income: StatementSection;
  expense: StatementSection;
  /** income total − expense total. */
  netProfit: number;
  hasActivity: boolean;
}

/** P&L for a FY: income vs expense, computed from the trial balance. */
export async function getProfitAndLoss(fyId?: string): Promise<ProfitAndLoss> {
  const rows = await getTrialBalance(fyId);
  const incomeLines = rows.filter((r) => r.account_type === "income").map(toLine).filter((l) => l.amount !== 0);
  const expenseLines = rows.filter((r) => r.account_type === "expense").map(toLine).filter((l) => l.amount !== 0);

  const incomeTotal = incomeLines.reduce((s, l) => s + l.amount, 0);
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  return {
    income: { label: "Income", lines: incomeLines, total: incomeTotal },
    expense: { label: "Expenses", lines: expenseLines, total: expenseTotal },
    netProfit: incomeTotal - expenseTotal,
    hasActivity: incomeLines.length > 0 || expenseLines.length > 0,
  };
}

export interface BalanceSheet {
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Net profit for the period, shown within equity as a reconciling line. */
  retainedResult: number;
  assetsTotal: number;
  /** liabilities + equity + retained result. */
  liabilitiesEquityTotal: number;
  balanced: boolean;
  hasActivity: boolean;
}

/**
 * Balance sheet for a FY, classified by account_type. Retained result (net P&L)
 * is folded into the equity side so the sheet balances before FY rollover posts
 * the closing entry to reserves.
 */
export async function getBalanceSheet(fyId?: string): Promise<BalanceSheet> {
  const rows = await getTrialBalance(fyId);

  const assetLines = rows.filter((r) => r.account_type === "asset").map(toLine).filter((l) => l.amount !== 0);
  const liabLines = rows.filter((r) => r.account_type === "liability").map(toLine).filter((l) => l.amount !== 0);
  const equityLines = rows.filter((r) => r.account_type === "equity").map(toLine).filter((l) => l.amount !== 0);

  const incomeTotal = rows.filter((r) => r.account_type === "income").reduce((s, r) => s + presented(r), 0);
  const expenseTotal = rows.filter((r) => r.account_type === "expense").reduce((s, r) => s + presented(r), 0);
  const retained = incomeTotal - expenseTotal;

  const assetsTotal = assetLines.reduce((s, l) => s + l.amount, 0);
  const liabTotal = liabLines.reduce((s, l) => s + l.amount, 0);
  const equityTotal = equityLines.reduce((s, l) => s + l.amount, 0);
  const leTotal = liabTotal + equityTotal + retained;

  return {
    assets: { label: "Assets", lines: assetLines, total: assetsTotal },
    liabilities: { label: "Liabilities", lines: liabLines, total: liabTotal },
    equity: { label: "Equity", lines: equityLines, total: equityTotal },
    retainedResult: retained,
    assetsTotal,
    liabilitiesEquityTotal: leTotal,
    balanced: Math.abs(assetsTotal - leTotal) < 0.5,
    hasActivity: rows.some((r) => Number(r.balance ?? 0) !== 0),
  };
}

export interface CashFlowSection {
  label: string;
  lines: StatementLine[];
  total: number;
}

export interface CashFlow {
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  hasActivity: boolean;
  approximate: true;
}

// Best-effort cash-flow classification by COA code range. This is an indicative
// activity view (movement in non-cash accounts as a proxy), NOT a reconciled
// statement — the spec calls for proper operating/investing/financing tagging
// on ledgers, which lands with the full account_ledgers model. Flagged
// `approximate` so the UI can say so honestly.
function classifyCashFlow(code: string): "operating" | "investing" | "financing" | null {
  const n = Number(code);
  if (Number.isNaN(n)) return null;
  // 15xx fixed assets → investing; 27xx/28xx loans & capital → financing;
  // everything else operating. Cash/bank themselves (111x/112x) excluded.
  if (code.startsWith("111") || code.startsWith("112")) return null;
  if (code.startsWith("15")) return "investing";
  if (code.startsWith("27") || code.startsWith("28") || code.startsWith("31") || code.startsWith("32")) return "financing";
  return "operating";
}

export async function getCashFlow(fyId?: string): Promise<CashFlow> {
  const rows = await getTrialBalance(fyId);
  const sections: Record<string, StatementLine[]> = { operating: [], investing: [], financing: [] };

  for (const r of rows) {
    const bal = Number(r.balance ?? 0);
    if (bal === 0) continue;
    const code = r.account_code ?? "";
    const cls = classifyCashFlow(code);
    if (!cls) continue;
    // Cash effect ≈ negative of the change in a non-cash account's debit balance.
    sections[cls].push({
      accountId: r.account_id ?? "",
      code,
      name: r.account_name ?? "—",
      type: (r.account_type ?? "asset") as AccountType,
      amount: -bal,
    });
  }

  const mk = (label: string, key: string): CashFlowSection => ({
    label,
    lines: sections[key],
    total: sections[key].reduce((s, l) => s + l.amount, 0),
  });

  const operating = mk("Operating", "operating");
  const investing = mk("Investing", "investing");
  const financing = mk("Financing", "financing");

  return {
    operating,
    investing,
    financing,
    netChange: operating.total + investing.total + financing.total,
    hasActivity: operating.lines.length + investing.lines.length + financing.lines.length > 0,
    approximate: true,
  };
}
