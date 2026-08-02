import { listAuditPage, listAuditEntities, type AuditAction } from "@/lib/data/audit";
import { AuditLogPage } from "./AuditLogPage";

export const metadata = { title: "Audit Log — NEWBIZZ" };
export const dynamic = "force-dynamic";

const ACTIONS: AuditAction[] = ["insert", "update", "delete", "approve", "reject", "post", "void", "login"];

export default async function AdminAuditPage() {
  const [{ rows }, entities] = await Promise.all([
    listAuditPage({}),
    listAuditEntities(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Audit Log</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Append-only trail of every mutation and approval.</p>
        </div>
      </div>
      <AuditLogPage initialRows={rows} entities={entities} actions={ACTIONS} />
    </div>
  );
}
