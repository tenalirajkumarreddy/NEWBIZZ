import { getCompany, listFinancialYears, listNumberSeries, listPaymentMethods, listEntitySerials, getFleetThresholds } from "@/lib/data/settings";
import { listBranches } from "@/lib/data/branches";
import { SettingsPage } from "./SettingsPage";

export const metadata = { title: "Settings — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [company, fys, numberSeries, paymentMethods, entitySerials, thresholds, branches] = await Promise.all([
    getCompany(),
    listFinancialYears(),
    listNumberSeries(),
    listPaymentMethods(),
    listEntitySerials(),
    getFleetThresholds(),
    listBranches(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Company Settings</h1>
      <SettingsPage
        company={company}
        financialYears={fys}
        numberSeries={numberSeries}
        paymentMethods={paymentMethods}
        entitySerials={entitySerials}
        thresholds={thresholds}
        branches={branches}
      />
    </div>
  );
}
