"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Heartbeat for server-rendered payroll surfaces (dashboard calendar, Payroll
 * tab statement, Workers balances, History log): re-renders the route every
 * 30s while the tab is visible, so saves from another device (phone ↔ web)
 * appear without a manual reload. The DayRecordPanel keeps its own fine-
 * grained poll; this covers everything that renders on the server.
 */
export function PayrollAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
