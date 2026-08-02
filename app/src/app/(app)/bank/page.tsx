import { listBankAccounts } from "@/lib/data/bank";
import { createClient } from "@/lib/supabase/server";
import { BankDashboard } from "./BankDashboard";

export const metadata = { title: "Bank Reconciliation — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function BankPage() {
  const supabase = createClient();
  const [accounts] = await Promise.all([listBankAccounts()]);

  const reconPromises = accounts.map(async (a) => {
    const { data } = await (supabase as any)
      .rpc("bank_reconciliation", { p_bank_account: a.id, p_as_on: new Date().toISOString().split("T")[0] })
      .maybeSingle();
    return { accountId: a.id, recon: data ?? null };
  });
  const reconResults = await Promise.all(reconPromises);
  const reconMap = Object.fromEntries(reconResults.map((r) => [r.accountId, r.recon]));

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Bank &amp; Credit Cards</h1>
        <div className="flex gap-2">
          <a href="/bank/new" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-darker">+ New Account</a>
          <a href="/bank/cheques" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-fill">Cheque Register</a>
        </div>
      </div>
      <BankDashboard accounts={accounts} reconMap={reconMap} />
    </div>
  );
}
