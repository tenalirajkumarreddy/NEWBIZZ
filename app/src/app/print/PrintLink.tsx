import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { detailHref, type PrintKind } from "./print-href";

// PrintLink — the "print this document" affordance in table rows (e.g. the
// challans register). The A4 sheet is embedded on the document's own detail
// page (PrintPreviewPanel), so "Print" simply takes you there, scrolled to the
// sheet, where the native print dialog is one button away. From a detail page
// header the chip is unnecessary — the sheet is already on the page.
export function PrintLink({
  kind,
  id,
  className,
}: {
  kind: PrintKind;
  id: string;
  className?: string;
}) {
  return (
    <Link
      href={detailHref(kind, id)}
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
