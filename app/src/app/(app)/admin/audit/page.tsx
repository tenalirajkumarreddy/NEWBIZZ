import { listAuditPage, listAuditEntities, type AuditAction } from "@/lib/data/audit";
import { AuditLogPage } from "./AuditLogPage";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit Log — NEWBIZZ" };
export const dynamic = "force-dynamic";

const ACTIONS: AuditAction[] = ["insert", "update", "delete", "approve", "reject", "post", "void", "login"];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string }>;
}) {
  const { actor } = await searchParams;
  const [{ rows }, entities] = await Promise.all([
    listAuditPage({ actorId: actor ?? null }),
    listAuditEntities(),
  ]);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Audit Log"
        subtitle="Append-only trail of every mutation and approval."
      />
      <AuditLogPage initialRows={rows} entities={entities} actions={ACTIONS} initialActor={actor} />
    </PageContainer>
  );
}
