// =====================================================================
// lib/data/documents.ts — typed readers for the Documents Vault.
//
// Metadata lives in the `documents` table; bytes live in the private
// `documents` Storage bucket. Reads are RLS-gated under the caller's JWT:
// internal rows are visible to every authenticated user, restricted rows only
// to the uploader + accounting managers. Preview/download URLs are produced
// on demand as short-lived signed URLs — the bucket is private, so there is
// never a public fetch path.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export interface DocumentListItem {
  id: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  tags: string[];
  visibility: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface DocumentsPage {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const ALLOWED_MIME_PREFIXES = ["pdf", "image/jpeg", "image/png", "image/webp", "msword", "officedocument"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Human label column (or fallback) for each attachable entity type. */
const ENTITY_LABEL_LOOKUPS: Record<string, { table: string; column: string } | null> = {
  license: { table: "licenses", column: "license_no" },
  supplier: { table: "suppliers", column: "name" },
  customer: { table: "customers", column: "name" },
  store: { table: "customer_stores", column: "name" },
  item: { table: "items", column: "name" },
  vehicle: { table: "vehicles", column: "reg_no" },
  invoice: { table: "invoices", column: "invoice_no" },
  supplier_bill: { table: "supplier_bills", column: "bill_no" },
  challan: { table: "delivery_challans", column: "challan_no" },
  credit_note: { table: "credit_notes", column: "credit_note_no" },
  bank_account: { table: "bank_accounts", column: "account_name" },
  worker: { table: "workers", column: "full_name" },
  production_run: { table: "production_runs", column: "run_no" },
  sales_order: { table: "sales_orders", column: "order_no" },
};

/**
 * Best-effort human label for the entity a document is attached to
 * (e.g. "Licence · L-0012"). Unresolvable or unknown entity types degrade to
 * a short id fragment; never throws.
 */
export async function resolveEntityLabel(
  entityType: string | null,
  entityId: string | null,
): Promise<string | null> {
  if (!entityType || !entityId) return null;
  const lookup = ENTITY_LABEL_LOOKUPS[entityType];
  if (!lookup) return `${entityType} · ${entityId.slice(0, 8)}`;
  const supabase = createClient();
  const res = await (supabase as any)
    .from(lookup.table)
    .select(lookup.column)
    .eq("id", entityId)
    .maybeSingle();
  const label = unwrap(res, null as any, "resolveEntityLabel");
  if (!label) return `${entityType} · ${entityId.slice(0, 8)}`;
  return `${entityType} · ${label[lookup.column]}`;
}

/** Resolve entity labels for a batch of documents (N+1-safe grouping). */
export async function resolveEntityLabels(rows: DocumentRow[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const key = (t: string | null, i: string | null) => (t && i ? `${t}:${i}` : "");
  for (const r of rows) {
    if (!key(r.entity_type, r.entity_id)) continue;
    out[key(r.entity_type, r.entity_id)] ??= await resolveEntityLabel(r.entity_type, r.entity_id);
  }
  return out;
}

/**
 * Paginated vault listing. Filters: free-text over title + tags, entity type,
 * visibility. Order newest-first.
 */
export async function getDocuments(opts: {
  search?: string;
  entityType?: string | null;
  visibility?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<DocumentsPage> {
  const supabase = createClient();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = (supabase as any).from("documents").select("id, title, mime_type, size_bytes, entity_type, entity_id, tags, visibility, uploaded_by, created_at", { count: "exact" });
  if (opts.search) q = q.or(`title.ilike.%${opts.search}%,tags.cs.{${opts.search}}`);
  if (opts.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts.visibility) q = q.eq("visibility", opts.visibility);
  q = q.order("created_at", { ascending: false }).range(from, to);

  const res = await q;
  const rows: any[] = unwrap(res, [], "getDocuments");
  const total = res.count ?? rows.length;

  // Resolve display names for the uploaders in one pass.
  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean))];
  const labelMap = await resolveEntityLabels(rows);
  const uploaderNames: Record<string, string> = {};
  if (uploaderIds.length) {
    const ures = await (supabase as any).from("users").select("id, full_name").in("id", uploaderIds);
    const us: any[] = unwrap(ures, [], "getDocuments.users");
    for (const u of us) uploaderNames[u.id] = u.full_name ?? "";
  }

  const items: DocumentListItem[] = rows.map((r) => {
    const ekey = r.entity_type && r.entity_id ? `${r.entity_type}:${r.entity_id}` : "";
    return {
      id: r.id,
      title: r.title,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityLabel: ekey ? (labelMap[ekey] ?? null) : null,
      tags: r.tags ?? [],
      visibility: r.visibility,
      uploadedByName: r.uploaded_by ? uploaderNames[r.uploaded_by] ?? null : null,
      createdAt: r.created_at,
    };
  });

  return { items, total, page, pageSize };
}

/**
 * Short-lived signed URL for preview/download. The bucket is private; the
 * caller must already hold an authenticated session (server action / RPC).
 */
export async function getDocumentSignedUrl(id: string, expiresIn = 3600): Promise<string | null> {
  const supabase = createClient();
  const res = await (supabase as any)
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  const row = unwrap(res, null as any, "getDocumentSignedUrl");
  if (!row) return null;
  const sres = await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, expiresIn);
  if (sres.error) {
    console.error("[data:getDocumentSignedUrl]", sres.error.message);
    return null;
  }
  return sres.data.signedUrl;
}
