// =====================================================================
// lib/data/journal.ts — readers for the ledger: journal entries (Day Book),
// a single entry with its lines, and an account ledger with running balance.
// Pure reads off journal_entries/journal_lines (RLS: read_ledger allows all
// authenticated). Numbers are debit-positive from the source rows.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export type JournalSource =
  | "manual" | "voucher" | "sale" | "purchase" | "payment" | "receipt"
  | "expense" | "production" | "handover" | "contra" | "opening"
  | "closing" | "scheme" | "adjustment" | "reconciliation";

export interface JournalEntryRow {
  id: string;
  entry_no: string;
  entry_date: string;
  source: string;
  narration: string | null;
  status: string;
  reversesId: string | null;
  postedByName: string | null;
  debitTotal: number;
  creditTotal: number;
  lineCount: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  debit: number;
  credit: number;
  partyType: string | null;
  memo: string | null;
}

export interface JournalEntryDetail extends JournalEntryRow {
  fyId: string;
  lines: JournalLine[];
}

interface RawLine {
  id: string;
  account_id: string;
  debit: number | string;
  credit: number | string;
  party_type: string | null;
  memo: string | null;
  account?: { code: string | null; name: string | null } | null;
}

interface RawEntry {
  id: string;
  entry_no: string;
  fy_id: string;
  entry_date: string;
  source: string;
  narration: string | null;
  status: string;
  reverses_id: string | null;
  poster?: { full_name: string | null } | null;
  lines?: RawLine[];
}

const ENTRY_SELECT =
  "id, entry_no, fy_id, entry_date, source, narration, status, reverses_id," +
  " poster:users!journal_entries_posted_by_fkey(full_name)," +
  " lines:journal_lines(id, account_id, debit, credit, party_type, memo," +
  " account:chart_of_accounts!journal_lines_account_id_fkey(code, name))";

function summarise(e: RawEntry): JournalEntryRow {
  const lines = e.lines ?? [];
  const debitTotal = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const creditTotal = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  return {
    id: e.id,
    entry_no: e.entry_no,
    entry_date: e.entry_date,
    source: e.source,
    narration: e.narration,
    status: e.status,
    reversesId: e.reverses_id,
    postedByName: e.poster?.full_name ?? null,
    debitTotal,
    creditTotal,
    lineCount: lines.length,
  };
}

/** Day Book / journal register. Filter by date range and/or source. */
export async function listJournalEntries(opts: {
  from?: string;
  to?: string;
  source?: string;
  limit?: number;
} = {}): Promise<JournalEntryRow[]> {
  const supabase = createClient();
  let q = supabase.from("journal_entries").select(ENTRY_SELECT).order("entry_date", { ascending: false }).order("entry_no", { ascending: false });
  if (opts.from) q = q.gte("entry_date", opts.from);
  if (opts.to) q = q.lte("entry_date", opts.to);
  if (opts.source) q = q.eq("source", opts.source);
  q = q.limit(opts.limit ?? 200);
  const res = await q.returns<RawEntry[]>();
  const rows = unwrap(res, [] as RawEntry[], "listJournalEntries");
  return rows.map(summarise);
}

/** A single entry with its lines (for the detail page + reverse action). */
export async function getJournalEntry(id: string): Promise<JournalEntryDetail | null> {
  const supabase = createClient();
  const res = await supabase.from("journal_entries").select(ENTRY_SELECT).eq("id", id).maybeSingle().returns<RawEntry | null>();
  const e = unwrap(res, null as RawEntry | null, "getJournalEntry");
  if (!e) return null;
  const base = summarise(e);
  return {
    ...base,
    fyId: e.fy_id,
    lines: (e.lines ?? []).map((l) => ({
      id: l.id,
      accountId: l.account_id,
      accountCode: l.account?.code ?? null,
      accountName: l.account?.name ?? null,
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      partyType: l.party_type,
      memo: l.memo,
    })),
  };
}

export interface LedgerLine {
  entryId: string;
  entryNo: string;
  entryDate: string;
  narration: string | null;
  source: string;
  debit: number;
  credit: number;
  running: number;
}

export interface AccountLedger {
  accountId: string;
  code: string | null;
  name: string | null;
  lines: LedgerLine[];
  debitTotal: number;
  creditTotal: number;
  closing: number;
}

interface RawLedgerRow {
  id: string;
  debit: number | string;
  credit: number | string;
  memo: string | null;
  entry?: {
    id: string;
    entry_no: string;
    entry_date: string;
    narration: string | null;
    source: string;
    fy_id: string;
  } | null;
}

/**
 * Ledger for one account within a FY: chronological lines with a running
 * debit-positive balance. Ordered by date then entry_no.
 */
export async function getLedger(accountId: string, fyId?: string): Promise<AccountLedger> {
  const supabase = createClient();

  const acctRes = await supabase.from("chart_of_accounts").select("code, name").eq("id", accountId).maybeSingle().returns<{ code: string | null; name: string | null } | null>();
  const acct = unwrap(acctRes, null as { code: string | null; name: string | null } | null, "getLedger.account");

  let q = supabase
    .from("journal_lines")
    .select("id, debit, credit, memo, entry:journal_entries!journal_lines_entry_id_fkey(id, entry_no, entry_date, narration, source, fy_id)")
    .eq("account_id", accountId);
  if (fyId) q = q.eq("entry.fy_id", fyId);
  const res = await q.returns<RawLedgerRow[]>();
  const raw = unwrap(res, [] as RawLedgerRow[], "getLedger");

  const withEntry = raw.filter((r) => r.entry != null);
  withEntry.sort((a, b) => {
    const da = a.entry!.entry_date;
    const db = b.entry!.entry_date;
    if (da !== db) return da < db ? -1 : 1;
    return a.entry!.entry_no < b.entry!.entry_no ? -1 : 1;
  });

  let running = 0;
  let debitTotal = 0;
  let creditTotal = 0;
  const lines: LedgerLine[] = withEntry.map((r) => {
    const debit = Number(r.debit ?? 0);
    const credit = Number(r.credit ?? 0);
    running += debit - credit;
    debitTotal += debit;
    creditTotal += credit;
    return {
      entryId: r.entry!.id,
      entryNo: r.entry!.entry_no,
      entryDate: r.entry!.entry_date,
      narration: r.memo ?? r.entry!.narration,
      source: r.entry!.source,
      debit,
      credit,
      running,
    };
  });

  return {
    accountId,
    code: acct?.code ?? null,
    name: acct?.name ?? null,
    lines,
    debitTotal,
    creditTotal,
    closing: running,
  };
}
