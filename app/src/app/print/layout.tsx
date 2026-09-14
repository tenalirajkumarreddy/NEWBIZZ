import type { Metadata } from "next";

export const metadata: Metadata = { title: "NEWBIZZ — Delivery Challan" };

// The print surface lives OUTSIDE the (app) group so no AppShell chrome
// (sidebar/topbar) leaks into the sheet, but it still renders inside the ROOT
// layout's <html>/<body> — a nested <html> from a segment layout is a Next
// error, so this layout is a plain paper wrapper, not a document.
//
// The root theme script can put the `dark` class on <html> for a dark-theme
// user, which would flip the text-ink / bg-fill tokens to the navy palette and
// print light-on-white paper. Re-declaring the light :root token values on
// this wrapper pins the whole print subtree to paper colours regardless of the
// stored theme, so `text-ink`, `border-line`, etc. keep the ReceiptSheet look.
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
    <div className="min-h-screen bg-white text-ink" style={PAPER_TOKENS}>
      {/* Print-only sheet metrics: the browser ignores Tailwind's screen
          padding when paging, so give the A4 page real physical margins. */}
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      {children}
    </div>
  );
}
