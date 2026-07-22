"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Keeps cached claims honest (plan §2.5). The server passes the token_version
// baked into the current JWT; we compare it to the live get_my_token_version()
// on mount and on tab-focus. On mismatch (an admin changed our roles/perms or
// suspended us), refreshSession() pulls a fresh token with fresh claims, then
// we re-render the server tree so the UI reflects the new access.
//
// This is UX only — the DB never trusts a stale claim regardless.
export function TokenVersionWatcher({ claimVersion }: { claimVersion: number }) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data, error } = await supabase.rpc("get_my_token_version");
      if (cancelled || error || typeof data !== "number") return;
      if (data !== claimVersion) {
        await supabase.auth.refreshSession();
        // Pull fresh server components with the new claims.
        window.location.reload();
      }
    }

    check();
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    // Also poll on a slow cadence as a backstop (realtime on users.own-row can
    // replace this later; see 0034 publication).
    const iv = setInterval(check, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [claimVersion]);

  return null;
}
