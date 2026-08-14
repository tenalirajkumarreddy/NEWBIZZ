import { listLicenses } from "@/lib/data/licenses";
import { LicensesPage } from "./LicensesPage";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Licence Register — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  const licenses = await listLicenses();

  return (
    <PageContainer width="full">
      <PageHeader
        title="Licence Register"
        subtitle="Statutory &amp; business licences with renewal tracking."
      />
      <LicensesPage licenses={licenses} />
    </PageContainer>
  );
}
