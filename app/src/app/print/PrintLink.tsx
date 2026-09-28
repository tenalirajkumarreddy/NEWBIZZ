import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

// PrintLink — the canonical "open print preview" affordance for document
// headers and table rows: the app's cyan link-chip with a printer glyph.
// Routes to /print/{kind}/{id}, where the sticky preview toolbar's Print
// button opens the browser's print window over the exact A4 sheet.
export function PrintLink({
  kind,
  id,
  className,
}: {
  kind: "invoice" | "challan" | "credit-note";
  id: string;
  className?: string;
}) {
  return (
    <Link
      href={`/print/${kind}/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline " +
        (className ?? "")
      }
    >
      <Icon name="print" size={13} />
      Print
    </Link>
  );
}
