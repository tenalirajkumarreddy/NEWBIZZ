"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDocuments, getDocumentSignedUrl, getDocumentsForEntity } from "@/lib/data/documents";
import { ALLOWED_MIME_PREFIXES, MAX_FILE_BYTES } from "@/lib/data/documents";
import type { DocumentsPage, DocumentListItem } from "@/lib/data/documents";

export type UploadError = { field?: string; message: string };
export type UploadResult =
  | { ok: true; id: string }
  | { ok: false; errors: UploadError[] };

const KIND_LABELS: Record<string, string> = {
  license: "Licence",
  supplier: "Supplier",
  customer: "Customer",
  store: "Store",
  item: "Item",
  vehicle: "Vehicle",
  invoice: "Invoice",
  supplier_bill: "Supplier Bill",
  challan: "Challan",
  credit_note: "Credit Note",
  bank_account: "Bank Account",
  loan: "Loan",
  worker: "Worker",
  expense: "Expense",
  bom: "BOM",
  production_run: "Production Run",
  sales_order: "Sales Order",
};

/**
 * Upload a document to the private `documents` bucket and record its metadata.
 * The action validates type + size server-side, then uploads under the
 * authenticated server client (so Storage RLS sees a real JWT and insert RLS
 * on the metadata row applies).
 */
export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string)?.trim() ?? "";
  const entityType = ((formData.get("entityType") as string) || "").trim() || null;
  const entityId = ((formData.get("entityId") as string) || "").trim() || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const visibility = (formData.get("visibility") as string) === "restricted" ? "restricted" : "internal";

  const errors: UploadError[] = [];
  if (!file) errors.push({ field: "file", message: "Choose a file to upload." });
  if (!title) errors.push({ field: "title", message: "Give the document a title." });
  if (!file) return { ok: false, errors };

  const mime = (file.type || "").toLowerCase();
  const allowed = ALLOWED_MIME_PREFIXES.some((p) => (p === "pdf" ? mime === "application/pdf" : mime.startsWith(p)));
  if (!allowed) errors.push({ field: "file", message: "Only PDF, images (jpg/png/webp), and Office documents (doc/docx/xls/xlsx) are allowed." });
  if (file.size > MAX_FILE_BYTES) errors.push({ field: "file", message: "File exceeds the 10 MB limit." });
  if (errors.length) return { ok: false, errors };

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errors: [{ message: "Please sign in to upload documents." }] };

  const folder = entityType && KIND_LABELS[entityType] ? entityType : "general";
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const fileName = `${randomUUID()}.${ext}`;
  const path = `${folder}/${yyyy}${mm}/${fileName}`;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, errors: [{ field: "file", message: `Upload failed: ${upErr.message}` }] };

  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  const { data: row, error: insErr } = await (supabase as any)
    .from("documents")
    .insert({
      title,
      storage_bucket: "documents",
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      entity_type: entityType,
      entity_id: entityId,
      tags,
      visibility,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insErr) {
    // Metadata write failed (RLS/validation). Best-effort remove the orphan object.
    await supabase.storage.from("documents").remove([path]);
    return { ok: false, errors: [{ message: insErr.message }] };
  }

  revalidatePath("/documents");
  return { ok: true, id: (row as any).id };
}

/**
 * Delete a document: remove its metadata row (RLS denies non-owner /
 * non-accounting) then best-effort remove the object from the bucket.
 * Deleting the object first would bypass the owner RLS, so we delete the row
 * first and treat object cleanup as best-effort.
 */
export async function deleteDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const rowRes = await (supabase as any)
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  const row = rowRes.data;

  const { error } = await (supabase as any).from("documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (row && row.storage_bucket && row.storage_path) {
    const clean = await supabase.storage.from(row.storage_bucket).remove([row.storage_path]);
    if (clean.error) console.error("[documents:delete] object cleanup", clean.error.message);
  }

  revalidatePath("/documents");
  return { ok: true };
}

/** Short-lived signed URL for preview/download (server-side; RLS-gated). */
export async function getPreviewUrl(id: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const url = await getDocumentSignedUrl(id);
  if (!url) return { ok: false, error: "Could not prepare a preview URL." };
  return { ok: true, url };
}

/** Client-driven vault search (applies filter params and returns the page). */
export async function searchDocuments(opts: {
  search?: string;
  entityType?: string | null;
  visibility?: string | null;
  page?: number;
}): Promise<{ ok: boolean; page?: DocumentsPage; error?: string }> {
  const page = await getDocuments(opts);
  return { ok: true, page };
}

/** Attachments for a single entity (inline panel on detail pages). */
export async function listEntityDocuments(
  entityType: string,
  entityId: string,
): Promise<{ ok: boolean; items?: DocumentListItem[]; error?: string }> {
  if (!entityType || !entityId) return { ok: false, error: "Missing entity reference." };
  const items = await getDocumentsForEntity(entityType, entityId);
  return { ok: true, items };
}

/**
 * Upload a document bound to a specific entity (inline panel flow). Identity
 * is locked to the passed entityType/entityId rather than client-supplied.
 */
export async function uploadEntityDocument(
  formData: FormData,
  entityType: string,
  entityId: string,
): Promise<UploadResult> {
  if (!entityType || !entityId) {
    return { ok: false, errors: [{ message: "This document must belong to a record." }] };
  }
  // Bind the fixed entity reference so the client can't spoof the attachment.
  formData.set("entityType", entityType);
  formData.set("entityId", entityId);
  const res = await uploadDocument(formData);
  return res;
}