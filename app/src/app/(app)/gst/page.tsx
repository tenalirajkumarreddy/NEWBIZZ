import Link from "next/link";
import {
  currentPeriod,
  getGstr1Summary,
  getGstr3bSummary,
  getHsnSummary,
  getSalesRegister,
  getPurchaseRegister,
} from "@/lib/data/gst";
import { GstReportsView } from "./GstReportsView";

// GST Reports hub (§5.9) — filing-ready summaries computed live from invoices
// and supplier bills for a chosen month. GSTR-1 (outward), GSTR-3B (output − ITC
// = net payable), HSN summary, and the sales/purchase registers. The 2B ITC
// reconciliation lives under /gst/2b.
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
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">GST Reports</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Filing summaries computed from your invoices and bills</p>
        </div>
        <Link
          href="/gst/2b"
          className="self-start rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand"
        >
          GSTR-2B reconciliation →
        </Link>
      </div>

      <GstReportsView period={period} gstr1={gstr1} gstr3b={gstr3b} hsn={hsn} sales={sales} purchases={purchases} />
    </div>
  );
}
