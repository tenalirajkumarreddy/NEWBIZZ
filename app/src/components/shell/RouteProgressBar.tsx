"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// RouteProgressBar — the global "something is happening" signal for every
// navigation in the (app) shell (Next 14 compatible).
//
// Next 14 has no router-level pending state and no useLinkStatus, so pending
// is detected at the two points we control:
//
//   • Click capture: a document-level `click` listener (capture phase) inspects
//     the anchor under the click. Anchors whose pathname differs from the
//     current one mark the bar pending. Link clicks here go through Next's own
//     handler too (this listener only observes).
//   • Settle: when the pathname/searchParams change (route rendered) the bar
//     jumps to 100% and fades out. A safety timeout caps the trickle so a
//     failed navigation can never leave a bar stuck across the screen.
//
// The bar is eased (fast start, decelerating trickle to 96%) so short loads
// flash and slow loads keep moving instead of looking frozen. It is fully
// aria-hidden and pointer-events-none — purely a visual affordance.
//
// Rendered once inside the shell, above every page. Browser back/forward and
// router.replace() don't fire click events; those navigations are usually fast
// (prefetched RSC payloads) and the page skeleton covers the remainder.

const TICK_MS = 100;
const EASE = 0.1; // fraction of remaining distance per tick
const START = 10; // immediate visible jump on click
const MAX_PENDING = 96; // never "finish" while still pending
const SAFETY_MS = 15_000; // cap: force-complete even if navigation never settles

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0); // 0 = hidden
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    timer.current = doneTimer.current = fadeTimer.current = safetyTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!timer.current) return; // not running
    clearTimers();
    setProgress(100);
    fadeTimer.current = setTimeout(() => setProgress(0), 320);
  }, [clearTimers]);

  const startPending = useCallback(() => {
    if (timer.current) return; // already running
    // A click on the CURRENT route (e.g. re-opening a panel link) shouldn't
    // start the bar — it resolves via searchParams and the effect below
    // finishes it instantly, but skipping keeps that path snappy.
    setProgress(START);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = p + (MAX_PENDING - p) * EASE;
        return next > MAX_PENDING ? MAX_PENDING : next;
      });
    }, TICK_MS);
    safetyTimer.current = setTimeout(finish, SAFETY_MS);
  }, [finish]);

  // Observe every click (capture phase, before React/Next handlers) and mark
  // pending when the anchor targets a different route in this app.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      // External / non-app links: let the browser handle them, no bar.
      if (!href.startsWith("/") && !href.startsWith(window.location.pathname)) return;

      const url = new URL((a as HTMLAnchorElement).href, window.location.href);
      // Exact current URL (Next treats it as a no-op — nothing will load):
      // skip entirely so the bar can't trickle into its safety cap.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        !url.hash
      )
        return;
      // Query-only change (tabs, ?action=… panels) lands in the same effect
      // below — the bar completes the instant the URL updates.
      startPending();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [startPending]);

  // Route rendered (or query changed): complete + fade.
  useEffect(() => {
    if (progress > 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => clearTimers, [clearTimers]);

  if (progress <= 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] w-full"
    >
      <div
        className="h-full bg-brand shadow-[0_0_8px_rgba(8,145,178,0.55)] transition-[width] duration-150 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transitionProperty: "width, opacity",
          transitionDuration: progress >= 100 ? "250ms" : "150ms",
        }}
      />
    </div>
  );
}
