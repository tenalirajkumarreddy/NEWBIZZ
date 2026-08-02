import { listLicenses } from "@/lib/data/licenses";
import { LicensesPage } from "./LicensesPage";

export const metadata = { title: "Licence Register — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  const licenses = await listLicenses();

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Licence Register</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Statutory &amp; business licences with renewal tracking.</p>
        </div>
      </div>
      <LicensesPage licenses={licenses} />
    </div>
  );
}
