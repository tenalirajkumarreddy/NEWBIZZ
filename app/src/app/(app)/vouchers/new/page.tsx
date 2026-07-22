import Link from "next/link";
import { listPostableAccounts } from "@/lib/data/accounting";
import { VoucherForm } from "./VoucherForm";

// Raise a manual voucher (§5.2). Server component: loads the postable accounts
// once and the IST "today" default, then hands off to the client form which
// enforces balance and posts via post_voucher (permission-gated).
export default async function NewVoucherPage() {
  const accounts = await listPostableAccounts();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/vouchers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Manual Vouchers
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New Voucher</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Post a balanced journal straight to the ledger. Debits must equal credits.
        </p>
      </div>
      <VoucherForm accounts={accounts} today={today} />
    </div>
  );
}
