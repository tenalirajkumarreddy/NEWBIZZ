// =====================================================================
// lib/documents-limits.ts — client-safe documents constraints.
//
// The upload allow-list and size cap previously lived in
// lib/data/documents.ts, which is `server-only`; client components (the
// quick-attach staging step) need the same rules to pre-flag bad files
// without importing server code. This module has NO server-only imports
// and is safe everywhere. The server action remains the authority — it
// re-validates on every upload.
// =====================================================================

/** Allowed mime prefixes (pdf matched exactly, others by prefix). */
export const ALLOWED_MIME_PREFIXES = [
  "pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "msword",
  "officedocument",
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function isAllowedMime(mimeLower: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) =>
    p === "pdf" ? mimeLower === "application/pdf" : mimeLower.startsWith(p),
  );
}

export function isAllowedFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  return isAllowedMime(mime) && file.size <= MAX_FILE_BYTES;
}

/** Rejection reason for staging UI, or null when acceptable. */
export function fileRejectionReason(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  if (!isAllowedMime(mime)) {
    return "Only PDF, images (jpg/png/webp), and Office documents are allowed.";
  }
  if (file.size > MAX_FILE_BYTES) return "File exceeds the 10 MB limit.";
  return null;
}
