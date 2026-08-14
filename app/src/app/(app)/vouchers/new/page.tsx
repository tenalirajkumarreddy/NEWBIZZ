import { listPostableAccounts } from "@/lib/data/accounting";
import { PageContainer, PageHeader } from "@/components/ui";
import { VoucherForm } from "./VoucherForm";

// Raise a manual voucher (§5.2). Server component: loads the postable accounts
// once and the IST "today" default, then hands off to the client form which
// enforces balance and posts via post_voucher (permission-gated).
export default async function NewVoucherPage() {
  const accounts = await listPostableAccounts();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <PageContainer width="detail">
      <PageHeader
        backHref="/vouchers"
        backLabel="Manual Vouchers"
        title="New Voucher"
        subtitle="Post a balanced journal straight to the ledger. Debits must equal credits."
      />
      <VoucherForm accounts={accounts} today={today} />
    </PageContainer>
  );
}
