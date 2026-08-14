import Link from "next/link";
import {
  currentPeriod,
  getGstr1Summary,
  getGstr3bSummary,
  getHsnSummary,
  getSalesRegister,
  getPurchaseRegister,
} from "@/lib/data/gst";
import { PageContainer, PageHeader } from "@/components/ui";
import { GstReportsView } from "./GstReportsView";

// GST Reports hub (§5.9) — filing-ready summaries computed live from invoices
// and supplier bills for a chosen month. GSTR-1 (outward), GSTR-3B (output − ITC
// = net payable), HSN summary, and the sales/purchase registers. The 2B ITC
// reconciliation lives under /gst/2b.
export const metadata = { title: "GST Reports — NEWBIZZ" };
export default async function GstPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = /^\d{4}-\d{2}$/.test(searchParams.period ?? "") ? searchParams.period! : currentPeriod();

  const [gstr1, gstr3b, hsn, sales, purchases] = await Promise.all([
    getGstr1Summary(period),
    getGstr3bSummary(period),
    getHsnSummary(period),
    getSalesRegister(period),
    getPurchaseRegister(period),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="GST Reports"
        subtitle="Filing summaries computed from your invoices and bills"
        actions={
          <Link
            href="/gst/2b"
            className="rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand"
          >
            GSTR-2B reconciliation →
          </Link>
        }
      />

      <GstReportsView period={period} gstr1={gstr1} gstr3b={gstr3b} hsn={hsn} sales={sales} purchases={purchases} />
    </PageContainer>
  );
}
