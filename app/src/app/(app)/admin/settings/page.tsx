import { getCompany, listFinancialYears, listNumberSeries, listPaymentMethods, listEntitySerials, getFleetThresholds } from "@/lib/data/settings";
import { listBranches } from "@/lib/data/branches";
import { SettingsPage } from "./SettingsPage";
import type { Tab as SettingsTab } from "./SettingsPage";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [company, fys, numberSeries, paymentMethods, entitySerials, thresholds, branches, { tab }] =
    await Promise.all([
      getCompany(),
      listFinancialYears(),
      listNumberSeries(),
      listPaymentMethods(),
      listEntitySerials(),
      getFleetThresholds(),
      listBranches(),
      searchParams,
    ]);

  return (
    <PageContainer width="full">
      <PageHeader title="Company Settings" />
      <SettingsPage
        company={company}
        financialYears={fys}
        numberSeries={numberSeries}
        paymentMethods={paymentMethods}
        entitySerials={entitySerials}
        thresholds={thresholds}
        branches={branches}
        initialTab={tab as SettingsTab | undefined}
      />
    </PageContainer>
  );
}
