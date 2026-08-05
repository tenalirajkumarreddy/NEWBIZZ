import { getDocumentsForEntity } from "@/lib/data/documents";
import { DocumentAttachPanelInner } from "./DocumentAttachPanelInner";

// ---------------------------------------------------------------------
// DocumentAttachPanel — inline "Documents" panel for any entity detail page.
//
// Server wrapper: fetches the entity's attachments under the caller's JWT and
// renders the interactive client inner (upload / preview / delete). Usage:
//
//   <DocumentAttachPanel entityType="invoice" entityId={inv.id}
//                       entityLabel={inv.invoice_no} />
//
// entityType must match the documents.entity_type vocabulary (see
// KIND_LABELS in lib/actions/documents.ts).
// ---------------------------------------------------------------------
export async function DocumentAttachPanel({
  entityType,
  entityId,
  entityLabel,
}: {
  entityType: string;
  entityId: string;
  entityLabel?: string;
}) {
  const items = await getDocumentsForEntity(entityType, entityId);
  return (
    <DocumentAttachPanelInner
      entityType={entityType}
      entityId={entityId}
      entityLabel={entityLabel}
      initial={items}
    />
  );
}
