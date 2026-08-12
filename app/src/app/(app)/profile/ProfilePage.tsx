"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRow } from "@/lib/data/users";
import { Button, PageContainer, PageHeader, Panel } from "@/components/ui";

type GoogleState =
  | { status: "loading" }
  | { status: "unlinked" }
  | { status: "linked"; email: string };

export function ProfilePage({ profile }: { profile: UserRow | null }) {
  const supabase = createClient();
  const [google, setGoogle] = useState<GoogleState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      setError(error.message);
      setGoogle({ status: "unlinked" });
      return;
    }
    const g = (data?.identities ?? []).find((i) => i.provider === "google");
    setGoogle(
      g
        ? { status: "linked", email: g.identity_data?.email ?? g.id }
        : { status: "unlinked" },
    );
  }, [supabase]);

  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);

  const link = async () => {
    setError(null);
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
      },
    });
    if (error) setError(error.message);
  };

  const unlink = async () => {
    if (!window.confirm("Unlink Google from this account?")) return;
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.getUserIdentities();
    const g = (data?.identities ?? []).find((i) => i.provider === "google");
    if (!g) {
      setBusy(false);
      setGoogle({ status: "unlinked" });
      return;
    }
    const { error } = await supabase.auth.unlinkIdentity(g);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setGoogle({ status: "unlinked" });
  };

  const roleLabel = profile?.roles.length
    ? profile.roles.map((r) => r.name).join(" · ")
    : "No role";

  return (
    <PageContainer width="form">
      <PageHeader title="Profile" subtitle="Your account and sign-in methods" />
      <Panel title="Account">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Name
            </div>
            <div className="mt-1 text-[14px] font-medium text-ink">
              {profile?.fullName ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Phone
            </div>
            <div className="mt-1 font-mono text-[14px] text-ink">
              {profile?.phone ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Role
            </div>
            <div className="mt-1 text-[14px] text-ink">{roleLabel}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Branch
            </div>
            <div className="mt-1 text-[14px] text-ink">
              {profile?.branchName ?? "—"}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Google sign-in"
        subtitle="Link Google to sign in with it instead of a phone code."
      >
        {google.status === "loading" ? (
          <p className="text-[13px] text-ink-4">Loading…</p>
        ) : google.status === "linked" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[13px] font-medium text-ink">Linked</div>
              <div className="mt-0.5 font-mono text-[13px] text-ink-3">
                {google.email}
              </div>
            </div>
            <Button variant="danger" size="sm" loading={busy} onClick={unlink}>
              Unlink Google
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-3">
              Not linked. Sign in with Google to link it to this account.
            </p>
            <Button variant="secondary" size="sm" onClick={link}>
              Link Google
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] font-medium text-red">{error}</p>}
      </Panel>
    </PageContainer>
  );
}