"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { printHref, type PrintKind } from "./print-href";

// PrintPreviewPanel — the print document lives ON the document's own detail
// page. No separate screen, no new tab: the page loads and the A4 sheet is
// right there, exactly as the printer will receive it. Every document action
// sits in ONE aligned bar directly above the paper:
//
//   [A4 print preview]   [page actions]   [With sign | Without sign] [Print]
//
//   • Signature toggle (`?sign=0` in the URL) asks the /print route for an
//     UNSIGNED copy — the signature area stays blank for a wet-ink signature.
//     Flipping it updates the URL and re-fetches the sheet, so what you see is
//     always exactly what prints. Pass `signable={false}` when the document
//     has no company signature to toggle.
//   • `toolbar` — the page's own action buttons (Record sales return, Re-issue,
//     Void…), rendered in the same line as Print.
//   • Print (and Ctrl/Cmd+P while the page is open) opens the browser's native
//     print dialog.
//
// How it works: the sheet HTML is fetched from the canonical /print/{kind}/{id}
// route — the single source of truth for the document design. The fetched DOM
// is unwrapped structurally (layout root > stage > paper card) so only the
// sheet markup + its <style> blocks (the @page A4 print rules) are injected —
// the standalone page's gallery dressing, toolbar and dev-boot scripts never
// come along.
//
// Printing: on `beforeprint` the sheet mount is moved to a direct child of
// <body> and a `printing-sheet` class on <html> collapses every other body
// child — the printer receives ONLY the sheet, paginated by the injected
// @page rules. `afterprint` moves it back. If beforeprint never fires (rare
// WebViews), the page prints as a normal page — degraded, never broken.
const SHEET_MOUNT_ID = "print-sheet-mount";
const SIGN_PARAM = "sign";

// Light tokens pinned on the mount — the same trick as print/layout.tsx's
// PAPER_TOKENS — so a dark-theme user still gets paper-white chrome. They
// travel with the mount when it moves to <body> for printing.
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

export function PrintPreviewPanel({
  kind,
  id,
  toolbar,
  signable = true,
}: {
  kind: PrintKind;
  id: string;
  /** Page-level action buttons rendered in the bar above the sheet, beside Print. */
  toolbar?: React.ReactNode;
  /** Offer the with/without-signature choice (the /print route must honour ?sign). */
  signable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signed = searchParams.get(SIGN_PARAM) !== "0";
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const prevTitle = useRef<string | null>(null);
  const homeRef = useRef<{ parent: HTMLElement; next: ChildNode | null } | null>(null);
  const printingRef = useRef(false);

  const href = printHref(kind, id) + (signed ? "" : `?${SIGN_PARAM}=0`);

  // Signature choice lives in the URL so it survives reloads and is shareable.
  // Other params (e.g. ?action=…) are preserved.
  function setSigned(next: boolean) {
    const p = new URLSearchParams(searchParams.toString());
    if (next) p.delete(SIGN_PARAM);
    else p.set(SIGN_PARAM, "0");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Restore the page title on unmount (the doc title becomes the print job name).
  useEffect(() => {
    return () => {
      if (prevTitle.current !== null) document.title = prevTitle.current;
    };
  }, []);

  // Print plumbing: move the mount to <body> for the duration of the print.
  useEffect(() => {
    const onBeforePrint = () => {
      const mount = document.getElementById(SHEET_MOUNT_ID);
      if (!mount || printingRef.current || mount.parentElement === document.body) return;
      printingRef.current = true;
      homeRef.current = { parent: mount.parentElement!, next: mount.nextSibling };
      document.body.appendChild(mount);
      document.documentElement.classList.add("printing-sheet");
    };
    const onAfterPrint = () => {
      document.documentElement.classList.remove("printing-sheet");
      printingRef.current = false;
      const mount = document.getElementById(SHEET_MOUNT_ID);
      if (mount && homeRef.current && homeRef.current.parent.isConnected) {
        homeRef.current.parent.insertBefore(mount, homeRef.current.next);
      }
      homeRef.current = null;
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      onAfterPrint();
    };
  }, []);

  // Fetch the print document and drop the sheet markup inline. Re-runs when the
  // signature choice flips the href — the current sheet stays visible until the
  // replacement arrives, so the toggle never blanks the preview.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
        // Expired session: /print redirects to /login — follow it in-place.
        if (res.redirected && res.url.includes("/login")) {
          window.location.href = res.url;
          return;
        }
        if (!res.ok) throw new Error(`Failed to load preview (${res.status})`);
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        if (cancelled) return;

        const mount = document.getElementById(SHEET_MOUNT_ID);
        if (!mount) return;

        // Unwrap the fetched page down to the sheet content. Locate the stage
        // by its class (child order is unreliable — the layout renders its
        // <style> before the stage), then take the paper card's CHILDREN —
        // every sheet copy (recipient + print-only office copy) plus its
        // <style> blocks. All <style> blocks anywhere in the fetched document
        // travel with the markup (the @page A4 rules and the copy/pagination
        // rules render inline in the body flow, not head).
        const stage = doc.body.querySelector("div[class*='print:p-0']") ?? doc.body;
        const card = stage.lastElementChild;
        const sheetHtml =
          card instanceof HTMLElement
            ? Array.from(card.children)
                .map((el) => el.outerHTML)
                .join("") || card.innerHTML
            : doc.body.innerHTML;
        const styles = Array.from(doc.querySelectorAll("style"))
          .map((s) => s.outerHTML)
          .join("");
        mount.innerHTML = styles + sheetHtml;

        // Scripts never execute via innerHTML; drop dev-boot leftovers.
        mount.querySelectorAll("script, nextjs-portal, next-route-announcer").forEach((el) => el.remove());

        // Document title becomes the print job name in the spooler.
        prevTitle.current = prevTitle.current ?? document.title;
        if (doc.title && !/print preview/i.test(doc.title)) document.title = doc.title;

        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [href]);

  return (
    <section
      aria-label="Print preview"
      id="print"
      className="flex scroll-mt-6 flex-col gap-2"
    >
      {/* ONE aligned bar above the paper: preview caption on the left;
          signature choice + page actions + Print on the right, Print last.
          Dropped from print output by the body-collapse rule (only the mount
          survives). Signature buttons use bg-surface so they follow the theme
          (literal bg-white goes blind in dark mode). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          <Icon name="doc" size={14} />
          A4 print preview
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {signable && (
            <div
              role="group"
              aria-label="Print with or without signature"
              className="ml-1 inline-flex overflow-hidden rounded-lg border border-line"
            >
              <button
                type="button"
                aria-pressed={signed}
                onClick={() => setSigned(true)}
                className={
                  "h-9 px-3.5 text-[13px] font-semibold transition-colors " +
                  (signed ? "bg-brand text-white" : "bg-surface text-ink-2 hover:bg-fill hover:text-ink")
                }
              >
                With sign
              </button>
              <button
                type="button"
                aria-pressed={!signed}
                onClick={() => setSigned(false)}
                className={
                  "h-9 border-l border-line px-3.5 text-[13px] font-semibold transition-colors " +
                  (!signed ? "bg-brand text-white" : "bg-surface text-ink-2 hover:bg-fill hover:text-ink")
                }
              >
                Without sign
              </button>
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            leading={<Icon name="print" size={15} />}
            onClick={() => window.print()}
            disabled={state !== "ready"}
          >
            Print
          </Button>
        </div>
      </div>

      {state === "loading" && (
        <div className="grid min-h-[200px] place-items-center rounded-[4px] border border-line bg-fill text-[13px] text-ink-3">
          Preparing print preview…
        </div>
      )}
      {state === "error" && (
        <div className="grid min-h-[200px] place-items-center rounded-[4px] border border-line bg-fill text-[13px] text-ink-3">
          Couldn&apos;t load the print preview.{" "}
          <button type="button" className="ml-1 text-brand hover:underline" onClick={() => window.open(href, "_blank")}>
            Open it in a new tab
          </button>
        </div>
      )}

      {/* The sheet, fetched from /print/{kind}/{id}. Hidden until ready. */}
      <div
        id={SHEET_MOUNT_ID}
        style={PAPER_TOKENS}
        className={"mx-auto w-full max-w-[210mm] " + (state === "ready" ? "" : "hidden")}
      >
        <div className="print-card rounded-[4px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_16px_40px_-12px_rgba(15,23,42,0.25)]">
          {/* fetched sheet markup lands here */}
        </div>
      </div>

      {/* Print routing: when the printing-sheet class is set (beforeprint),
          everything on the page except the mount collapses away. @page uses
          margin 0 — the sheets carry their own inner padding (8mm on the A4
          invoice sheet, 12/14mm on the print-doc sheets), exactly like the
          standalone /print route's layout. A non-zero margin here shrinks the
          page box below the sheet's fixed 210mm width and clips/spills the
          document onto extra pages. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html.printing-sheet body { background: #fff !important; }
          html.printing-sheet body > *:not(#${SHEET_MOUNT_ID}) { display: none !important; }
          html.printing-sheet #${SHEET_MOUNT_ID} {
            max-width: none !important;
            width: auto !important;
            margin: 0 !important;
          }
          html.printing-sheet #${SHEET_MOUNT_ID} .print-card {
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </section>
  );
}
