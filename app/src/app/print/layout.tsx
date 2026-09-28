import type { Metadata } from "next";
import { PrintPreviewBar } from "./PrintPreviewBar";

export const metadata: Metadata = { title: "NEWBIZZ — Print preview" };

// The print surface lives OUTSIDE the (app) group so no AppShell chrome
// (sidebar/topbar) leaks into the sheet, but it still renders inside the ROOT
// layout's <html>/<body> — a nested <html> from a segment layout is a Next
// error, so this layout is a plain paper wrapper, not a document.
//
// Screen: a light gallery surround (screen-shell tokens, NOT paper greys —
// re-pinning paper values here would grey the sheet itself) with the sticky
// print-preview toolbar and the A4 sheet as an elevated paper card. The sheet
// on screen is the exact component the printer receives.
//
// Print: @page A4 + 12mm margins take over, toolbar drops out (print:hidden),
// the surround and card dressing whiten/flatten, and the sheet's mm geometry
// carries the page.
//
// The root theme script can put the `dark` class on <html> for a dark-theme
// user, which would flip text-ink / bg-fill to the navy palette and print
// light-on-white paper. PAPER_TOKENS re-declares the light :root values on the
// sheet wrapper, pinning the document subtree to paper colours regardless of
// the stored theme.
const PAPER_TOKENS = {
  "--nb-bg": "255 255 255",
  "--nb-surface": "255 255 255",
  "--nb-line": "226 232 240",
  "--nb-line-soft": "241 245 249",
  "--nb-ink": "15 23 42",
  "--nb-ink-2": "71 85 105",
  "--nb-ink-3": "100 116 139",
  "--nb-ink-4": "148 163 184",
  "--nb-brand": "8 145 178",
  "--nb-brand-d": "14 116 144",
  "--nb-brand-wash": "236 254 255",
  "--nb-fill": "248 250 252",
  "--nb-line-strong": "203 213 225",
  "--nb-body-ink": "30 41 59",
  colorScheme: "light",
} as React.CSSProperties;

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f1f5f9] print:bg-white">
      {/* Print-only sheet metrics: @page carries zero margin (the sheet owns
          its full A4 geometry incl. inner padding, so the printed page is
          byte-for-byte the sheet rendered on screen) and the screen-only
          auto-centre is dropped. NOTE: the embedded PrintPreviewPanel flow
          brings its own @page rule — the two never coexist in one document
          because this block governs the standalone /print route only. */}
      <style>{`@media print {
        @page { size: A4; margin: 0; }
        .print-sheet { margin: 0 !important; }
      }`}</style>

      {/* stage: toolbar renders on screen only; the sheet sits as an elevated
          A4 card whose shadow/rounding are screen-only dressing. */}
      <div className="px-4 py-6 print:p-0 md:px-8">
        <div className="print:hidden">
          <PrintPreviewBar />
        </div>
        <div
          className="mx-auto mt-5 w-full max-w-[210mm] rounded-[4px] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_16px_40px_-12px_rgba(15,23,42,0.25)] print:mt-0 print:rounded-none print:shadow-none"
          style={PAPER_TOKENS}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
