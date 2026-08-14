"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./Dialog";

// UnsavedGuard — prevents losing typed work when the user navigates away from a
// dirty form.
//
// Mount it inside a form page (usually a create/edit form) with
// `dirty={boolean}`:
//
//   const formRef = useRef<HTMLDivElement>(null);
//   const { dirty, reset } = useFormDirty(formRef);
//   ...
//   <div ref={formRef}>…fields…</div>
//   <UnsavedGuard dirty={dirty} message="…" />
//   // after a successful save: reset();
//
// While dirty it (1) warns on browser refresh/close/tab-exit via beforeunload,
// and (2) intercepts in-app anchor navigation (sidebar, top bar, links, cancel)
// and asks for confirmation. Confirming carries the navigation through; the
// component handles the router push so the user keeps control.
//
// useFormDirty drives the dirty state from the form's own input/change events,
// so no per-field tracking is needed. It works on a `<form>` element or any
// wrapping container holding the fields. Call `reset()` after a successful
// submit so navigation afterwards doesn't nag.
export function useFormDirty(containerRef: React.RefObject<HTMLElement | null>) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const mark = () => setDirty(true);
    el.addEventListener("input", mark);
    el.addEventListener("change", mark);

    return () => {
      el.removeEventListener("input", mark);
      el.removeEventListener("change", mark);
    };
  }, [containerRef]);

  return { dirty, reset: () => setDirty(false) };
}

export function UnsavedGuard({
  dirty,
  message = "You have unsaved changes. They'll be lost if you leave this page.",
}: {
  dirty: boolean;
  message?: string;
}) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [confirming, setConfirming] = useState(false);
  const pendingRef = useRef<{ href: string } | null>(null);

  // Browser refresh / close / tab.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // In-app navigation: intercept clicks on anchors while dirty.
  useEffect(() => {
    if (!dirty) return;

    const onClick = (e: MouseEvent) => {
      // only left-click, no modifier held.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href.startsWith("#") || anchor.target === "_blank") return;

      e.preventDefault();
      e.stopPropagation();
      pendingRef.current = { href };
      setConfirming(true);
    };

    // Capture phase so it fires before Next's own handlers everywhere (sidebar,
    // top bar, cancel links).
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function confirmLeave() {
    const href = pendingRef.current?.href;
    setConfirming(false);
    pendingRef.current = null;
    if (!href) return;
    if (href.startsWith("http") || href.startsWith("mailto") || href.startsWith("tel:")) {
      window.location.href = href;
    } else {
      router.push(href);
    }
  }

  return (
    <ConfirmDialog
      open={confirming}
      onClose={() => {
        setConfirming(false);
        pendingRef.current = null;
      }}
      onConfirm={confirmLeave}
      title="Discard unsaved changes?"
      description={message}
      confirmLabel="Leave"
      danger
      loading={false}
    />
  );
}