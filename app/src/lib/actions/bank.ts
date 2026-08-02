"use server";

import { createClient } from "@/lib/supabase/server";

export async function createBankAccount(data: {
  name: string;
  bankName?: string;
  accountNo?: string;
  ifsc?: string;
  glAccountCode?: string;
  accountType: "bank" | "credit_card";
  creditLimit?: number;
  paymentDueDay?: number;
  cardLastFour?: string;
  openingBalance?: number;
  openingDate?: string;
}) {
  const supabase = createClient();
  const { error } = await (supabase as any).from("bank_accounts").insert({
    name: data.name,
    bank_name: data.bankName ?? null,
    account_no: data.accountNo ?? null,
    ifsc: data.ifsc ?? null,
    gl_account_code: data.glAccountCode ?? (data.accountType === "credit_card" ? "2101" : "1120"),
    account_type: data.accountType,
    credit_limit: data.creditLimit ?? null,
    payment_due_day: data.paymentDueDay ?? null,
    card_last_four: data.cardLastFour ?? null,
    opening_balance: data.openingBalance ?? 0,
    opening_date: data.openingDate ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateBankAccount(id: string, data: {
  name?: string;
  bankName?: string;
  accountNo?: string;
  ifsc?: string;
  glAccountCode?: string;
  creditLimit?: number;
  paymentDueDay?: number;
  cardLastFour?: string;
  status?: string;
}) {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.bankName !== undefined) patch.bank_name = data.bankName;
  if (data.accountNo !== undefined) patch.account_no = data.accountNo;
  if (data.ifsc !== undefined) patch.ifsc = data.ifsc;
  if (data.glAccountCode !== undefined) patch.gl_account_code = data.glAccountCode;
  if (data.creditLimit !== undefined) patch.credit_limit = data.creditLimit;
  if (data.paymentDueDay !== undefined) patch.payment_due_day = data.paymentDueDay;
  if (data.cardLastFour !== undefined) patch.card_last_four = data.cardLastFour;
  if (data.status !== undefined) patch.status = data.status;
  const { error } = await (supabase as any).from("bank_accounts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function importBankStatement(
  accountId: string,
  rows: { txnDate: string; amount: number; description?: string; refNo?: string; valueDate?: string; runningBalance?: number }[],
  opts?: { fileName?: string; fileHash?: string; periodStart?: string; periodEnd?: string; closingBalance?: number },
) {
  const supabase = createClient();
  const payload = rows.map((r) => ({
    txn_date: r.txnDate,
    amount: r.amount,
    description: r.description ?? null,
    ref_no: r.refNo ?? null,
    value_date: r.valueDate ?? null,
    running_balance: r.runningBalance ?? null,
  }));
  const { data, error } = await (supabase as any).rpc("import_bank_statement", {
    p_bank_account: accountId,
    p_rows: JSON.stringify(payload),
    p_opts: JSON.stringify({
      file_name: opts?.fileName ?? null,
      file_hash: opts?.fileHash ?? null,
      period_start: opts?.periodStart ?? null,
      period_end: opts?.periodEnd ?? null,
      closing_balance: opts?.closingBalance ?? null,
    }),
  });
  if (error) throw new Error(error.message);
  return data as { import_id: string; inserted: number; duplicates: number; total: number };
}

export async function matchBankTransaction(
  transactionId: string,
  target: { journalEntryId?: string; receiptId?: string; paymentId?: string; amount?: number },
) {
  const supabase = createClient();
  const { error } = await (supabase as any).rpc("match_bank_txn", {
    p_txn: transactionId,
    p_target: {
      journal_entry_id: target.journalEntryId ?? null,
      receipt_id: target.receiptId ?? null,
      payment_id: target.paymentId ?? null,
      amount: target.amount ?? null,
    },
  });
  if (error) throw new Error(error.message);
}

export async function postReconAdjustment(
  accountId: string,
  amount: number,
  kind: "bank_charge" | "interest_income" | "other",
  opts?: { adjDate?: string; narration?: string; bankTransactionId?: string },
) {
  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc("post_reconciliation_adjustment", {
    p_bank_account: accountId,
    p_amount: amount,
    p_kind: kind,
    p_opts: {
      adj_date: opts?.adjDate ?? null,
      narration: opts?.narration ?? null,
      bank_transaction_id: opts?.bankTransactionId ?? null,
    },
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function registerCheque(data: {
  bankAccountId?: string;
  direction: "inbound" | "outbound";
  chequeNo: string;
  partyType?: string;
  partyId?: string;
  amount: number;
  chequeDate?: string;
  receiptId?: string;
  paymentId?: string;
  notes?: string;
}) {
  const supabase = createClient();
  const { error } = await (supabase as any).rpc("register_cheque", {
    p_header: {
      bank_account_id: data.bankAccountId ?? null,
      direction: data.direction,
      cheque_no: data.chequeNo,
      party_type: data.partyType ?? null,
      party_id: data.partyId ?? null,
      amount: data.amount,
      cheque_date: data.chequeDate ?? null,
      receipt_id: data.receiptId ?? null,
      payment_id: data.paymentId ?? null,
      notes: data.notes ?? null,
    },
  });
  if (error) throw new Error(error.message);
}

export async function setChequeStatus(chequeId: string, status: string) {
  const supabase = createClient();
  const { error } = await (supabase as any).rpc("set_cheque_status", {
    p_cheque: chequeId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function bounceCheque(chequeId: string, reason?: string) {
  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc("bounce_cheque", {
    p_cheque: chequeId,
    p_reason: reason ?? "Cheque bounced",
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteImport(importId: string) {
  const supabase = createClient();
  await (supabase as any)
    .from("bank_statement_imports")
    .delete()
    .eq("id", importId);
}
