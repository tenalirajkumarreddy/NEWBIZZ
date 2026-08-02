import { getCreditRegister, summariseCredit } from "@/lib/data/credit";
import { CreditManagementPage } from "./CreditManagementPage";

export const metadata = { title: "Credit Management — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function CreditPage() {
  const rows = await getCreditRegister();
  const summary = summariseCredit(rows);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Credit Management</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Customer limits, payment terms, utilisation and over-limit exposure.
          </p>
        </div>
      </div>
      <CreditManagementPage rows={rows} summary={summary} />
    </div>
  );
}
