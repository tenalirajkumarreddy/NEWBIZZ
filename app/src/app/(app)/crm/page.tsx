import { listLeads, getCrmKpis } from "@/lib/data/crm";
import { Kpi } from "@/components/ui";
import { count as fmtCount } from "@/lib/format";
import { LeadsTable } from "./LeadsTable";

export const dynamic = "force-dynamic";

export const metadata = { title: "CRM & Complaints — NEWBIZZ" };
export default async function CrmLeadsPage() {
  const [leads, kpis] = await Promise.all([
    listLeads(),
    getCrmKpis(),
  ]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total leads" value={fmtCount(kpis.totalLeads)} sub={`${fmtCount(kpis.newLeads)} new`} />
        <Kpi label="Contacted" value={fmtCount(kpis.contactedLeads)} sub={`${fmtCount(kpis.qualifiedLeads)} qualified`} />
        <Kpi label="Converted" value={fmtCount(kpis.convertedLeads)} tone="grn" sub={`${fmtCount(kpis.lostLeads)} lost`} />
        <Kpi label="Follow-ups due" value={fmtCount(kpis.dueFollowUps)} tone={kpis.dueFollowUps > 0 ? "amb" : undefined} sub={`${fmtCount(kpis.openComplaints)} open complaints`} />
      </div>

      <LeadsTable leads={leads} />
    </>
  );
}
