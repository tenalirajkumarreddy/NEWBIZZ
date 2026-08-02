import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import { getCompany } from "./settings";

// =====================================================================
// lib/data/tally.ts - Tally XML export (F8).
//
// Produces an importable Tally XML envelope for the CA:
//   1. Masters - every active postable chart-of-accounts ledger, parented
//      to a standard Tally group by account type.
//   2. Vouchers - every posted journal entry in the chosen date range,
//      rendered as Journal vouchers with balanced ledger entries.
//
// Ledger names are "<code> <name>" (code is unique) so the voucher ledger
// entries always resolve to a master emitted in the same file. Debits are
// exported as positive AMOUNT, credits as negative - Tally's convention.
// Dates are DDMMYYYY, Tally's import format. Reads are RLS-scoped, so the
// export only ever covers what the caller's perms allow.
// =====================================================================

const TALLY_GROUP: Record<string, string> = {
  asset: "Current Assets",
  liability: "Current Liabilities",
  equity: "Capital Account",
  income: "Indirect Incomes",
  expense: "Indirect Expenses",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 2026-08-01 -> 01082026 (Tally import format). */
function tallyDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}${m}${y}`;
}

/** "<code> <name>" - unique ledger key that both masters and vouchers use. */
function ledgerKey(code: string, name: string): string {
  return `${code} ${name}`.trim();
}

interface RawAccount {
  code: string;
  name: string;
  type: string;
  is_postable: boolean;
  status: string;
}

interface RawLine {
  account_id: string;
  debit: number | string;
  credit: number | string;
  account?: { code: string | null; name: string | null } | null;
}

interface RawEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  source: string;
  narration: string | null;
  status: string;
  lines?: RawLine[] | null;
}

export interface TallyExportResult {
  xml: string;
  fileName: string;
  voucherCount: number;
  ledgerCount: number;
  from: string;
  to: string;
}

/**
 * Build the full Tally import XML (masters + vouchers) for a date range.
 * Returns { xml, counts }. Throws on a blocked/empty data read so the caller
 * can surface a helpful message.
 */
export async function buildTallyXml(opts: { from: string; to: string }): Promise<TallyExportResult> {
  const supabase = createClient();
  const [company, accounts, entries] = await Promise.all([
    getCompany(),
    supabase
      .from("chart_of_accounts")
      .select("code, name, type, is_postable, status")
      .eq("status", "active")
      .order("code", { ascending: true })
      .returns<RawAccount[]>(),
    supabase
      .from("journal_entries")
      .select(
        "id, entry_no, entry_date, source, narration, status," +
          " lines:journal_lines(account_id, debit, credit, account:chart_of_accounts!journal_lines_account_id_fkey(code, name))",
      )
      .eq("status", "posted")
      .gte("entry_date", opts.from)
      .lte("entry_date", opts.to)
      .order("entry_date", { ascending: true })
      .order("entry_no", { ascending: true })
      .returns<RawEntry[]>(),
  ]);

  const acctRows = unwrap(accounts, [] as RawAccount[], "tally:accounts");
  const entryRows = unwrap(entries, [] as RawEntry[], "tally:entries");
  if (acctRows.length === 0 || entryRows.length === 0) {
    throw new Error("Nothing to export in this date range.");
  }

  const companyName = esc(company?.legalName || company?.tradeName || "NEWBIZZ");
  const masters: string[] = [];
  const used = new Set<string>();
  const addMaster = (code: string, name: string, type: string) => {
    const key = ledgerKey(code, name);
    if (used.has(key)) return;
    used.add(key);
    const parent = TALLY_GROUP[type] ?? "Primary";
    masters.push(
      `        <LEDGER ACTION="Create" NAME="${esc(key)}" RESERVEDNAME=""><PARENT>${parent}</PARENT></LEDGER>`,
    );
  };

  for (const a of acctRows) {
    if (a.is_postable) addMaster(a.code, a.name, a.type);
  }

  const vouchers: string[] = [];
  let skipped = 0;
  for (const e of entryRows) {
    const lines = e.lines ?? [];
    const mapped = lines
      .map((l) => {
        const acct = l.account;
        if (!acct?.code || !acct.name) return null;
        addMaster(acct.code, acct.name, "");
        const amt = Number(l.debit) - Number(l.credit);
        if (amt === 0) return null;
        return `              <LEDGERENTRY><LEDGERNAME>${esc(ledgerKey(acct.code, acct.name))}</LEDGERNAME><AMOUNT>${amt.toFixed(2)}</AMOUNT></LEDGERENTRY>`;
      })
      .filter((x): x is string => x !== null);
    if (mapped.length < 2) {
      skipped += 1;
      continue;
    }
    const guid = e.id.replace(/-/g, "").slice(0, 32).toUpperCase();
    vouchers.push(
      "          <VOUCHER VCHTYPE=\"Journal\" ACTION=\"Create\" OBJVIEW=\"Voucher\">" +
        `\n            <DATE>${tallyDate(e.entry_date)}</DATE>` +
        `\n            <GUID>${guid}</GUID>` +
        `\n            <VOUCHERNUMBER>${esc(e.entry_no)}</VOUCHERNUMBER>` +
        `\n            <NARRATION>${esc(e.narration ?? `${e.entry_no} (${e.source})`)}</NARRATION>` +
        `\n            <LEDGERENTRIES>\n${mapped.join("\n")}\n            </LEDGERENTRIES>` +
        "\n          </VOUCHER>",
    );
  }

  if (vouchers.length === 0) {
    throw new Error("No complete (balanced, 2+ line) journal entries in this date range.");
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "  <BODY>",
    "    <IMPORTDATA>",
    "      <REQUESTDESC>",
    "        <REPORTNAME>All Masters</REPORTNAME>",
    `        <STATICVARIABLES><SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY></STATICVARIABLES>`,
    "      </REQUESTDESC>",
    "      <REQUESTDATA>",
    '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    masters.join("\n"),
    "        </TALLYMESSAGE>",
    "      </REQUESTDATA>",
    "    </IMPORTDATA>",
    "    <IMPORTDATA>",
    "      <REQUESTDESC>",
    "        <REPORTNAME>Voucher Register</REPORTNAME>",
    `        <STATICVARIABLES><SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY></STATICVARIABLES>`,
    "      </REQUESTDESC>",
    "      <REQUESTDATA>",
    '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    vouchers.join("\n"),
    "        </TALLYMESSAGE>",
    "      </REQUESTDATA>",
    "    </IMPORTDATA>",
    "  </BODY>",
    "</ENVELOPE>",
  ].join("\n");

  return {
    xml,
    fileName: `tally-export-${opts.from}-to-${opts.to}.xml`,
    voucherCount: vouchers.length,
    ledgerCount: used.size,
    from: opts.from,
    to: opts.to,
  };
}
