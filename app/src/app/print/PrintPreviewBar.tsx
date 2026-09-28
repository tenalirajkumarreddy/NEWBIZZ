"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

// PrintPreviewBar — the screen-only toolbar that surrounds the A4 print
// preview. The A4 sheet (print-doc.tsx) renders below it, untouched, so the
// screen preview and the paper output are pixel-identical: no window.open, no
// re-render — the preview IS the document.
//
// Print behaviour:
//   • window.print() prints the whole page, so the bar is print:hidden (both
//     here and in layout.tsx — a duplicated guard survives a cascade bug) and
//     the stage's surround is whited out in the print layout.
//   • Headless-Chrome/Selenium (window.print is a no-op without a real print
//     backend): falls back to opening the print-dialog target in a new tab,
//     matching the app's previous "open print sheet" behaviour. Emulated media
//     (devtools device mode) also routes here — window.print would render
//     screen media, not the paper sheet.
//   • Normal browsers: straight to the OS print window with the paper sheet
//     pre-laid-out by print/layout.tsx @page rules.
export function PrintPreviewBar({ className }: { className?: string }) {
  const print = () => {
    if (typeof window === "undefined") return;
    // No real print backend (headless) or print media emulated (device mode):
    // window.print would be a no-op or render the wrong media.
    if (!("chrome" in window) || window.matchMedia("print").matches) {
      window.open(window.location.href, "_blank");
      return;
    }
    window.print();
  };

  return (
    <div
      className={
        "print:hidden sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-line-strong bg-white px-4 py-3 shadow-sm " +
        (className ?? "")
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-fill text-ink-2"
          aria-hidden
        >
          <Icon name="doc" size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">Print preview</p>
          <p className="truncate text-[11px] text-ink-4">
            A4 sheet · exactly what the printer receives
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="md"
          leading={<Icon name="back" size={14} />}
          onClick={() => window.history.back()}
        >
          Back
        </Button>
        <Button
          variant="secondary"
          size="md"
          leading={<Icon name="open" size={14} />}
          onClick={() => window.open(window.location.href, "_blank")}
        >
          Open in tab
        </Button>
        <Button
          variant="primary"
          size="md"
          leading={<Icon name="print" size={15} />}
          onClick={print}
        >
          Print
        </Button>
      </div>
    </div>
  );
}
