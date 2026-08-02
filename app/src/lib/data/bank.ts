import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export type AccountType = "bank" | "credit_card";

export interface BankAccountRow {
  id: string;
  name: string;
  bankName: string | null;
  accountNo: string | null;
  ifsc: string | null;
  glAccountCode: string;
  accountType: AccountType;
  creditLimit: number | null;
  paymentDueDay: number | null;
  cardLastFour: string | null;
  openingBalance: number;
  openingDate: string | null;
  status: string;
}

const ACCOUNT_SELECT = [
  "id", "name", "bank_name", "account_no", "ifsc",
  "gl_account_code", "account_type", "credit_limit",
  "payment_due_day", "card_last_four", "opening_balance",
  "opening_date", "status",
].join(",");

const MAP_ACCOUNT = (r: any): BankAccountRow => ({
  id: r.id,
  name: r.name,
  bankName: r.bank_name,
  accountNo: r.account_no,
  ifsc: r.ifsc,
  glAccountCode: r.gl_account_code,
  accountType: r.account_type as AccountType,
  creditLimit: r.credit_limit ? Number(r.credit_limit) : null,
  paymentDueDay: r.payment_due_day,
  cardLastFour: r.card_last_four,
  openingBalance: Number(r.opening_balance),
  openingDate: r.opening_date,
  status: r.status,
});

export async function listBankAccounts(type?: AccountType): Promise<BankAccountRow[]> {
  const supabase = createClient();
  let q = (supabase as any)
    .from("bank_accounts")
    .select(ACCOUNT_SELECT)
    .order("name");
  if (type) q = q.eq("account_type", type);
  const rows = unwrap(await q, [] as any[], "listBankAccounts");
  return rows.map(MAP_ACCOUNT);
}

export async function getBankAccount(id: string): Promise<BankAccountRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await (supabase as any)
      .from("bank_accounts")
      .select(ACCOUNT_SELECT)
      .eq("id", id)
      .single(),
    null as any,
    "getBankAccount",
  );
  if (!row) return null;
  return MAP_ACCOUNT(row);
}

export interface BankTransactionRow {
  id: string;
  bankAccountId: string;
  importId: string | null;
  txnDate: string;
  valueDate: string | null;
  description: string | null;
  refNo: string | null;
  amount: number;
  direction: string;
  runningBalance: number | null;
  matched: boolean;
  matchedAt: string | null;
}

const TXN_SELECT = [
  "id", "bank_account_id", "import_id", "txn_date",
  "value_date", "description", "ref_no", "amount",
  "direction", "running_balance", "matched", "matched_at",
].join(",");

export async function listTransactions(
  accountId: string,
  opts?: { matched?: boolean; from?: string; to?: string; limit?: number },
): Promise<BankTransactionRow[]> {
  const supabase = createClient();
  let q = (supabase as any)
    .from("bank_transactions")
    .select(TXN_SELECT)
    .eq("bank_account_id", accountId)
    .order("txn_date", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.matched != null) q = q.eq("matched", opts.matched);
  if (opts?.from) q = q.gte("txn_date", opts.from);
  if (opts?.to) q = q.lte("txn_date", opts.to);
  const rows = unwrap(await q, [] as any[], "listTransactions");
  return rows.map((r: any) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    importId: r.import_id,
    txnDate: r.txn_date,
    valueDate: r.value_date,
    description: r.description,
    refNo: r.ref_no,
    amount: Number(r.amount),
    direction: r.direction,
    runningBalance: r.running_balance ? Number(r.running_balance) : null,
    matched: r.matched,
    matchedAt: r.matched_at,
  }));
}

export interface ReconReport {
  bookBalance: number;
  statementBalance: number;
  matchedCount: number;
  unmatchedStmtCount: number;
  unmatchedStmtValue: number;
  difference: number;
}

export async function getReconReport(accountId: string, asOn?: string): Promise<ReconReport | null> {
  const supabase = createClient();
  const row = unwrap(
    await (supabase as any).rpc("bank_reconciliation", {
      p_bank_account: accountId,
      p_as_on: asOn ?? new Date().toISOString().split("T")[0],
    }).maybeSingle(),
    null as any,
    "getReconReport",
  );
  if (!row) return null;
  return {
    bookBalance: Number(row.book_balance),
    statementBalance: Number(row.statement_balance),
    matchedCount: row.matched_count,
    unmatchedStmtCount: row.unmatched_stmt_count,
    unmatchedStmtValue: Number(row.unmatched_stmt_value),
    difference: Number(row.difference),
  };
}

export interface ImportRow {
  id: string;
  fileName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalance: number | null;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  importedAt: string;
}

export async function listImports(accountId: string): Promise<ImportRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("bank_statement_imports")
      .select("id, file_name, period_start, period_end, closing_balance, row_count, inserted_count, duplicate_count, imported_at")
      .eq("bank_account_id", accountId)
      .order("imported_at", { ascending: false }),
    [] as any[],
    "listImports",
  );
  return rows.map((r: any) => ({
    id: r.id,
    fileName: r.file_name,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    closingBalance: r.closing_balance ? Number(r.closing_balance) : null,
    rowCount: r.row_count,
    insertedCount: r.inserted_count,
    duplicateCount: r.duplicate_count,
    importedAt: r.imported_at,
  }));
}

export interface ChequeRow {
  id: string;
  bankAccountId: string | null;
  direction: string;
  chequeNo: string;
  partyType: string | null;
  partyId: string | null;
  amount: number;
  chequeDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export async function listCheques(opts?: { status?: string; accountId?: string }): Promise<ChequeRow[]> {
  const supabase = createClient();
  let q = (supabase as any)
    .from("cheque_registry")
    .select("id, bank_account_id, direction, cheque_no, party_type, party_id, amount, cheque_date, status, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.accountId) q = q.eq("bank_account_id", opts.accountId);
  const rows = unwrap(await q, [] as any[], "listCheques");
  return rows.map((r: any) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    direction: r.direction,
    chequeNo: r.cheque_no,
    partyType: r.party_type,
    partyId: r.party_id,
    amount: Number(r.amount),
    chequeDate: r.cheque_date,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export interface AdjRow {
  id: string;
  adjType: string;
  amount: number;
  adjDate: string;
  narration: string | null;
  journalEntryId: string | null;
  createdAt: string;
}

export async function listAdjustments(accountId: string): Promise<AdjRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("reconciliation_adjustments")
      .select("id, adj_type, amount, adj_date, narration, journal_entry_id, created_at")
      .eq("bank_account_id", accountId)
      .order("created_at", { ascending: false }),
    [] as any[],
    "listAdjustments",
  );
  return rows.map((r: any) => ({
    id: r.id,
    adjType: r.adj_type,
    amount: Number(r.amount),
    adjDate: r.adj_date,
    narration: r.narration,
    journalEntryId: r.journal_entry_id,
    createdAt: r.created_at,
  }));
}
