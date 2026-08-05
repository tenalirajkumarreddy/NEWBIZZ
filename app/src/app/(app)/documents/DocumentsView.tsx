"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Button,
  Panel,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Field,
  Input,
  Select,
  Dialog,
  Drawer,
  ConfirmDialog,
  EmptyState,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { uploadDocument, deleteDocument, getPreviewUrl, searchDocuments } from "@/lib/actions/documents";
import type { DocumentsPage, DocumentListItem } from "@/lib/data/documents";

// ---------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  license: "Licence",
  supplier: "Supplier",
  customer: "Customer",
  store: "Store",
  item: "Item",
  vehicle: "Vehicle",
  invoice: "Invoice",
  receipt: "Receipt",
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

function kindLabel(kind: string | null): string {
  if (!kind) return "General";
  return KIND_LABELS[kind] ?? kind;
}

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

// ---------------------------------------------------------------------
// Upload drawer
// ---------------------------------------------------------------------

function UploadDrawer({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "restricted">("internal");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  function reset() {
    setFile(null);
    setTitle("");
    setEntityType("");
    setEntityId("");
    setTags("");
    setVisibility("internal");
    setErrors({});
  }

  async function submit() {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("title", title);
    if (entityType) fd.set("entityType", entityType);
    if (entityId) fd.set("entityId", entityId);
    fd.set("tags", tags);
    fd.set("visibility", visibility);

    startTransition(async () => {
      const res = await uploadDocument(fd);
      if (!res.ok) {
        const errMap: Record<string, string> = {};
        for (const e of res.errors) errMap[e.field ?? "form"] = e.message;
        setErrors(errMap);
        return;
      }
      toast.success("Document uploaded");
      reset();
      onUploaded();
      onClose();
    });
  }

  const kindOptions = Object.entries(KIND_LABELS).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <Drawer open={open} onClose={onClose} title="Upload document" description="PDF, images, and Office documents up to 10 MB.">
      <div className="flex flex-col gap-4">
        <Field label="File" required error={errors.file}>
          <input
            type="file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              if (e.target.files?.[0] && !title) setTitle(e.target.files[0].name.replace(/\.[^.]+$/, ""));
            }}
            className="block w-full text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-fill file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink"
          />
        </Field>

        <Field label="Title" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. GST registration certificate" />
        </Field>

        <Field label="Attach to" hint="Optional — pick the record this document belongs to.">
          <div className="flex flex-col gap-2">
            <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setEntityId(""); }}>
              <option value="">No attachment</option>
              {kindOptions.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
            {entityType && (
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder={`${kindLabel(entityType)} id`}
              />
            )}
          </div>
        </Field>

        <Field label="Tags" hint="Comma-separated, e.g. gst, renewal">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gst, renewal" />
        </Field>

        <Field label="Visibility">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="internal">Internal — visible to all staff</option>
            <option value="restricted">Restricted — uploader + accounting only</option>
          </Select>
        </Field>

        {errors.form && <p className="text-[12px] font-medium text-red">{errors.form}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !file}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------

function PreviewDialog({ doc, onClose }: { doc: DocumentListItem | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = !!doc;

  // Fetch the signed URL once per opened document (re-keyed by parent).
  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!doc) return;
    startTransition(async () => {
      const res = await getPreviewUrl(doc.id);
      if (res.ok && res.url) setUrl(res.url);
      else setError(res.error ?? "Could not load preview.");
    });
  }, [doc?.id]);

  return (
    <Dialog open={open} onClose={onClose} title={doc?.title} size="lg">
      {doc && (
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
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------

export function DocumentsView({ initial }: { initial: DocumentsPage }) {
  const [items, setItems] = useState(initial.items);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [visFilter, setVisFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<DocumentListItem | null>(null);
  const [deleting, setDeleting] = useState<DocumentListItem | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function applyFilters() {
    startTransition(async () => {
      const res = await searchDocuments({
        search: search || undefined,
        entityType: entityFilter || null,
        visibility: visFilter || null,
      });
      if (res.ok && res.page) setItems(res.page.items);
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
    toast.success("Document deleted");
    setItems((prev) => prev.filter((d) => d.id !== deleting.id));
    setDeleting(null);
  }

  const kindOptions = Object.entries(KIND_LABELS).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="Search">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Title or tag…"
              />
            </Field>
          </div>
          <div className="w-[180px]">
            <Field label="Type">
              <Select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); applyFilters(); }}>
                <option value="">All types</option>
                {kindOptions.map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-[150px]">
            <Field label="Visibility">
              <Select value={visFilter} onChange={(e) => { setVisFilter(e.target.value); applyFilters(); }}>
                <option value="">All</option>
                <option value="internal">Internal</option>
                <option value="restricted">Restricted</option>
              </Select>
            </Field>
          </div>
          <Button onClick={applyFilters} variant="secondary" disabled={pending}>Search</Button>
          <Button onClick={() => setShowUpload(true)}>Upload document</Button>
        </div>
      </Panel>

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            title="No documents yet"
            description="Upload your first file to build the vault."
            action={<Button onClick={() => setShowUpload(true)}>Upload document</Button>}
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Document</TH>
                <TH>Attached to</TH>
                <TH>Tags</TH>
                <TH>Visibility</TH>
                <TH>Uploaded by</TH>
                <TH>Date</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-fill text-[11px] font-bold text-ink-3">
                        {fileGlyph(d.mimeType)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink">{d.title}</div>
                        <div className="text-[11px] text-ink-4">{formatBytes(d.sizeBytes)} · {kindLabel(d.entityType)}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-[12px] text-ink-2">{d.entityLabel ?? "—"}</span>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {d.tags.length === 0 ? (
                        <span className="text-[11px] text-ink-4">—</span>
                      ) : (
                        d.tags.slice(0, 3).map((t) => (
                          <Badge key={t} size="sm" tone="neutral">{t}</Badge>
                        ))
                      )}
                    </div>
                  </TD>
                  <TD>
                    <StatusBadgeSafe visibility={d.visibility} />
                  </TD>
                  <TD><span className="text-[12px] text-ink-2">{d.uploadedByName ?? "—"}</span></TD>
                  <TD><span className="text-[12px] text-ink-3">{formatDate(d.createdAt)}</span></TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreview(d)}>Preview</Button>
                      <Button variant="ghost" size="sm" onClick={() => void download(d)}>Download</Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleting(d)}>Delete</Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      <UploadDrawer open={showUpload} onClose={() => setShowUpload(false)} onUploaded={() => void applyFilters()} />

      {preview && <PreviewDialog key={preview.id} doc={preview} onClose={() => setPreview(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => onDelete()}
        title="Delete document?"
        description={deleting ? `"${deleting.title}" and its stored file will be permanently removed.` : ""}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function fileGlyph(mime: string | null): string {
  if (!mime) return "?";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("sheet") || mime.includes("excel")) return "XLS";
  return "FILE";
}

function StatusBadgeSafe({ visibility }: { visibility: string }) {
  return (
    <Badge tone={visibility === "restricted" ? "amb" : "grn"} dot>
      {visibility === "restricted" ? "Restricted" : "Internal"}
    </Badge>
  );
}

async function download(d: DocumentListItem) {
  const res = await getPreviewUrl(d.id);
  if (res.ok && res.url) window.open(res.url, "_blank");
}
