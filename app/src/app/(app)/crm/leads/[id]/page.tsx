import { notFound } from "next/navigation";
import Link from "next/link";
import { getLead, listInteractions } from "@/lib/data/crm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LeadDetailClient } from "./LeadDetailClient";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [lead, interactions] = await Promise.all([
    getLead(id),
    listInteractions({ leadId: id }),
  ]);

  if (!lead) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/crm" className="text-[12px] font-medium text-ink-4 hover:text-brand">← CRM</Link>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{lead.name}</h1>
          <Badge
            tone={lead.status === "converted" ? "grn" : lead.status === "lost" ? "red" : lead.status === "qualified" ? "amb" : lead.status === "contacted" ? "brand" : "slate"}
            size="sm"
          >
            {lead.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {lead.status !== "converted" && lead.status !== "lost" && (
            <Link href={`/crm/leads/${lead.id}/edit`}>
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      <LeadDetailClient lead={lead} interactions={interactions} />
    </div>
  );
}
