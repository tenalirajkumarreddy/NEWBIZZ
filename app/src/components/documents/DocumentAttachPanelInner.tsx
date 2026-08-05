"use client";

import { useState, useTransition, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  listEntityDocuments,
  uploadEntityDocument,
  deleteDocument,
  getPreviewUrl,
} from "@/lib/actions/documents";
import type { DocumentListItem } from "@/lib/data/documents";

// ---------------------------------------------------------------------
// DocumentAttachPanelInner — the interactive inner half of the inline
// "Documents" panel. Lists attachments for one entity, allows upload (bound
// to that entity), inline preview, download and delete.
// ---------------------------------------------------------------------

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith("image/");
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fileGlyph(mime: string | null): string {
  if (!mime) return "?";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("sheet") || mime.includes("excel")) return "XLS";
  return "FILE";
}

export function DocumentAttachPanelInner({
  entityType,
  entityId,
  entityLabel,
  initial,
}: {
  entityType: string;
  entityId: string;
  entityLabel?: string;
  initial: DocumentListItem[];
}) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "restricted">("internal");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentListItem | null>(null);
  const [deleting, setDeleting] = useState<DocumentListItem | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setItems(initial), [initial]);

  function refresh() {
    startTransition(async () => {
      const res = await listEntityDocuments(entityType, entityId);
      if (res.ok && res.items) setItems(res.items);
    });
  }

  function submitUpload() {
    if (!file) { setError("Choose a file to attach."); return; }
    if (!title.trim()) { setError("Give the document a title."); return; }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("title", title.trim());
    fd.set("visibility", visibility);
    startTransition(async () => {
      const res = await uploadEntityDocument(fd, entityType, entityId);
      if (!res.ok) {
        setError(res.errors.map((e) => e.message).join(" "));
        return;
      }
      toast.success("Document attached");
      setFile(null);
      setTitle("");
      setVisibility("internal");
      refresh();
    });
  }

  async function onDelete() {
    if (!deleting) return;
    const res = await deleteDocument(deleting.id);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed");
      setDeleting(null);
      return;
    }
    toast.success("Document removed");
    setItems((prev) => prev.filter((d) => d.id !== deleting.id));
    setDeleting(null);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Documents</h3>
          <p className="text-[11px] text-ink-4">
            {entityLabel ? `Attached to ${entityLabel}` : "Attachments for this record"}
          </p>
        </div>
        <Button variant="subtle" size="sm" onClick={refresh} disabled={pending}>
          Refresh
        </Button>
      </div>

      {/* Upload row */}
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-line-strong bg-fill/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              if (e.target.files?.[0] && !title) setTitle(e.target.files[0].name.replace(/\.[^.]+$/, ""));
            }}
            className="min-w-0 flex-1 text-[12px] text-ink file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:text-ink"
          />
          <div className="flex items-center gap-2">
            <Select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "internal" | "restricted")}
              className="h-8 w-[130px] text-[12px]"
            >
              <option value="internal">Internal</option>
              <option value="restricted">Restricted</option>
            </Select>
            <Button variant="primary" size="sm" onClick={submitUpload} loading={pending} disabled={!file}>
              Attach
            </Button>
          </div>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Document title (e.g. GST certificate, delivery challan scan)"
          className="h-8 text-[12px]"
        />
        {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyState
          title="No documents attached"
          description="Upload a file above to attach it to this record."
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fill text-[10px] font-bold text-ink-3">
                {fileGlyph(d.mimeType)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{d.title}</div>
                <div className="flex items-center gap-2 text-[11px] text-ink-4">
                  <span>{formatBytes(d.sizeBytes)}</span>
                  <span>·</span>
                  <span>{formatDate(d.createdAt)}</span>
                  {d.uploadedByName && (
                    <>
                      <span>·</span>
                      <span>{d.uploadedByName}</span>
                    </>
                  )}
                  <Badge size="sm" tone={d.visibility === "restricted" ? "amb" : "grn"}>
                    {d.visibility === "restricted" ? "Restricted" : "Internal"}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setPreview(d)}>Preview</Button>
                <Button variant="ghost" size="sm" onClick={() => void download(d)}>Download</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(d)} className="text-red">Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <PreviewDialog doc={preview} onClose={() => setPreview(null)} />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => onDelete()}
        title="Remove document?"
        description={deleting ? `"${deleting.title}" and its stored file will be permanently removed.` : ""}
        confirmLabel="Remove"
        danger
      />
    </Card>
  );
}

// ---------------------------------------------------------------------
// Preview dialog (compact inline preview, mirrors the vault's dialog)
// ---------------------------------------------------------------------
function PreviewDialog({ doc, onClose }: { doc: DocumentListItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setUrl(null);
    setError(null);
    startTransition(async () => {
      const res = await getPreviewUrl(doc.id);
      if (res.ok && res.url) setUrl(res.url);
      else setError(res.error ?? "Could not load preview.");
    });
  }, [doc.id]);

  return (
    <Dialog open onClose={onClose} title={doc.title} size="lg">
      <div className="flex flex-col gap-3">
        {url ? (
          isImage(doc.mimeType) || doc.mimeType === "application/pdf" ? (
            <iframe src={url} className="h-[60vh] w-full rounded-lg border border-line bg-white" title={doc.title} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-[13px] text-ink-3">No inline preview for this file type.</p>
            </div>
          )
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-[12px] font-medium text-red">{error}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-8">
            <p className="text-[12px] text-ink-4">{pending ? "Preparing preview…" : "…"}</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {url && (
            <Button variant="secondary" onClick={() => window.open(url, "_blank")}>
              {isImage(doc.mimeType) || doc.mimeType === "application/pdf" ? "Open in new tab" : "Download"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

async function download(d: DocumentListItem) {
  const res = await getPreviewUrl(d.id);
  if (res.ok && res.url) window.open(res.url, "_blank");
}
