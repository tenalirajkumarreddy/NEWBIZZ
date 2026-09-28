export type PrintKind = "invoice" | "challan" | "credit-note";

/** Canonical URL of a document's A4 print sheet (standalone route, also what the inline preview fetches). */
export function printHref(kind: PrintKind, id: string): string {
  return `/print/${kind}/${id}`;
}

/** The document's own detail page, scrolled to the embedded A4 sheet (#print). */
export function detailHref(kind: PrintKind, id: string): string {
  const base = kind === "invoice" ? "/invoices" : kind === "challan" ? "/challans" : "/credit-notes";
  return `${base}/${id}#print`;
}
