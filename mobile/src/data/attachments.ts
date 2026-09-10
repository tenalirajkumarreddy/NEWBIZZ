import { useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { supabase } from "../lib/supabase";
import { qk } from "./keys";

/**
 * Receipt images attached to transactions (expenses, handovers/transfers).
 * Stored in the documents vault, tagged by entity so managers can review
 * them: documents.entity_type = "expenses" | "transfers", entity_id = row id.
 */

export type TxnEntityType = "expenses" | "transfers";

export interface TxnImageRow {
  id: string;
  title: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

const SELECT = "id, title, storage_bucket, storage_path, mime_type, size_bytes, uploaded_by, created_at";

export function useTransactionImages(entityType: TxnEntityType, entityId: string, enabled = true) {
  return useQuery({
    queryKey: qk.txnImages(entityType, entityId),
    enabled: enabled && !!entityId,
    queryFn: async (): Promise<TxnImageRow[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select(SELECT)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as TxnImageRow[];
    },
  });
}

function extFromMime(mime: string | null | undefined, fallbackExt?: string): string {
  if (mime?.includes("png")) return "png";
  if (mime?.includes("webp")) return "webp";
  if (mime?.includes("pdf")) return "pdf";
  if (mime?.includes("jpeg") || mime?.includes("jpg")) return "jpg";
  return fallbackExt ?? "jpg";
}

export async function uploadTransactionImage(input: {
  localUri: string;
  entityType: TxnEntityType;
  entityId: string;
  index?: number;
}): Promise<TxnImageRow> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in");

  const resp = await fetch(input.localUri);
  const blob = await resp.blob();
  const mime = (blob as Blob & { type?: string }).type || "image/jpeg";
  const ext = extFromMime(mime);
  const now = new Date();
  const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const path = `${input.entityType}/${yyyyMM}/${uid}/${Date.now()}-${input.index ?? 0}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(path, blob, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { data: row, error: insErr } = await supabase
    .from("documents")
    .insert({
      title: "Receipt",
      storage_bucket: "documents",
      storage_path: path,
      mime_type: mime,
      size_bytes: blob.size,
      entity_type: input.entityType,
      entity_id: input.entityId,
      tags: ["mobile", "receipt"],
      visibility: "internal",
      uploaded_by: uid,
    })
    .select(SELECT)
    .single();
  if (insErr) {
    await supabase.storage.from("documents").remove([path]).catch(() => {});
    throw insErr;
  }
  return row as TxnImageRow;
}

export async function imageSignedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !(data as any)?.signedUrl) throw error ?? new Error("Could not open image");
  return (data as any).signedUrl as string;
}

export async function openImage(bucket: string, path: string): Promise<void> {
  const url = await imageSignedUrl(bucket, path);
  await Linking.openURL(url);
}

export async function deleteTransactionImage(row: TxnImageRow): Promise<void> {
  const { error } = await supabase.from("documents").delete().eq("id", row.id);
  if (error) throw error;
  await supabase.storage.from(row.storage_bucket).remove([row.storage_path]).catch(() => {});
}

export async function uploadTransactionImages(
  localUris: string[],
  entityType: TxnEntityType,
  entityId: string,
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < localUris.length; i++) {
    try {
      await uploadTransactionImage({ localUri: localUris[i], entityType, entityId, index: i });
      ok++;
    } catch {
      // keep going; report the count
    }
  }
  return ok;
}
