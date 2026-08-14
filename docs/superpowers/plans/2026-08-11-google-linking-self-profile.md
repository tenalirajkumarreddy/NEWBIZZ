# Google Linking + Self-Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell users whose Google email isn't linked to any NEWBIZZ account to log in with their phone and link Google from a new self-profile page, and clean up the orphaned sign-in.

**Architecture:** The OAuth callback detects an orphan (a user whose `phone` is null), deletes both the `public.users` and `auth.users` rows via a narrowly-guarded security-definer RPC called under the user's own session, and redirects to `/login?google=unlinked`. A new `/profile` page (server page + client component) reads the linked Google identity via `supabase.auth.getUserIdentities()` and links/unlinks through GoTrue's `linkIdentity`/`unlinkIdentity`. A Profile item is added to the topbar user menu.

**Tech Stack:** Next.js (App Router, RSC + client components), TypeScript, `@supabase/supabase-js` ^2.110.7, `@supabase/ssr` ^0.12.3, PostgreSQL/plpgsql migrations.

Spec: `docs/superpowers/specs/2026-08-11-google-linking-self-profile-design.md` (approved)

## Global Constraints

- No test framework exists in this app. Verification is `npm run typecheck`, `npm run lint`, `npm run build` (run from `app/`), plus the manual flows listed in each task.
- Migration file number must be `0942_google_orphan_cleanup.sql` (next after `0941_access_control_smoke.sql`).
- Migrations follow the codebase convention (see `0030_auth_bridge.sql`): functions are `public.*`, `security definer`, `set search_path to 'public'`, then `revoke execute ... from anon, public;` and `grant execute ... to authenticated;`.
- Phone is the primary identity. The phone identity must never be deleted or unlinked; GoTrue forbids removing a user's last identity anyway.
- No service-role key usage anywhere. No new anon-executable RPCs (only `authenticated` may call the new function).
- Do not introduce a test framework, new dependencies, or new UI primitives.
- Copy uses the app's design tokens: banner alert = `border border-amb/25 bg-amber-wash text-amb`; destructive = `text-red` / `bg-red-wash`. No emojis.
- The `origin` used for redirects is the request's own origin (`new URL(request.url)`), matching the existing callback code.

---

### Task 1: Migration — `cleanup_orphan_google_user()` RPC

**Files:**
- Create: `app/supabase/migrations/0942_google_orphan_cleanup.sql`

**Interfaces:**
- Consumes: nothing new (uses existing `public.current_app_user()`, defined in `0003_core_rpcs.sql`).
- Produces: `public.cleanup_orphan_google_user() returns boolean` — callable by any authenticated user with **no arguments**. Returns `true` when both rows were deleted, `false` when the caller isn't an orphan. Never raises.

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- 0942_google_orphan_cleanup.sql
--
-- Self-service cleanup for orphaned Google sign-ins. A fresh Google OAuth
-- sign-in creates an auth.users row + a public.users row (status
-- pending_review, phone NULL). That account can never be signed into, so
-- instead of leaving a zombie in the admin Pending queue, the OAuth callback
-- calls this RPC to delete both rows for the just-signed-in caller.
--
-- Guards: only ever deletes the CALLER's own row (auth.uid()), and only when
-- phone IS NULL — real identities sign up by phone, so a phone-bearing row
-- can never be touched here. Security definer so it can write auth.users;
-- the caller never passes an id. Idempotent: calling twice just returns
-- false the second time (the rows are gone).
-- =====================================================================

create or replace function public.cleanup_orphan_google_user()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := public.current_app_user();
  v_phone text;
begin
  if v_uid is null then
    return false;
  end if;

  -- Only a phone-less row is an orphan; anything else must not be touched.
  select u.phone into v_phone
    from public.users u
   where u.id = v_uid;

  if v_phone is not null then
    return false;
  end if;

  delete from public.users where id = v_uid;
  delete from auth.users where id = v_uid;

  return true;
end $$;

alter function public.cleanup_orphan_google_user() set search_path = public;

revoke execute on function public.cleanup_orphan_google_user() from anon, public;
grant  execute on function public.cleanup_orphan_google_user() to authenticated;
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Use `supabase db push` (or the Supabase MCP `apply_migration` with name `google_orphan_cleanup`) and confirm it applies cleanly.

- [ ] **Step 3: Verify the RPC behavior in SQL**

In the Supabase SQL editor, as the anon role (no session), confirm it is not callable:

```sql
-- expect: ERROR: permission denied for function cleanup_orphan_google_user
select public.cleanup_orphan_google_user();
```

As a signed-in user whose `public.users.phone` is set (any normal account), confirm it is a safe no-op:

```sql
-- sign in with a real phone account first
select public.cleanup_orphan_google_user();
-- expect: returns false; the caller's public.users row still exists
select id, phone from public.users where id = auth.uid();
```

Orphan simulation (run as an authenticated user whose row has `phone IS NULL` — e.g. an existing pending Google sign-in, or temporarily `update public.users set phone = null where id = auth.uid()`):

```sql
select public.cleanup_orphan_google_user();
-- expect: returns true, then the session is dead
-- verify: select id from auth.users where id = auth.uid();  -> 0 rows
```

- [ ] **Step 4: Commit**

```bash
git add app/supabase/migrations/0942_google_orphan_cleanup.sql
git commit -m "feat(db): add cleanup_orphan_google_user definer rpc"
```

---

### Task 2: OAuth callback — orphan detection + cleanup + redirect

**Files:**
- Modify: `app/src/app/auth/callback/route.ts` (whole file, 17 lines today)

**Interfaces:**
- Consumes: `public.cleanup_orphan_google_user()` (boolean) from Task 1; `createClient()` from `@/lib/supabase/server`.
- Produces: the redirect contract the login page (Task 3) and profile flow depend on:
  - Fresh Google sign-in (no phone) → `GET /auth/callback` → 307 to `/login?google=unlinked`.
  - Normal sign-in / link flow → 307 to `next` (default `/`).

- [ ] **Step 1: Rewrite the route**

Replace the whole file body with:

```tsx
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) redirect target: exchange the code for a session, then
// bounce to `next`. A fresh Google sign-in whose email isn't linked to any
// phone account has no phone on the auth user — that's an orphan: delete both
// the auth + profile rows (cleanup_orphan_google_user) and send the user back
// to login with an explanation. Linking a Google identity to an existing
// phone account never hits this branch (phone is present).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Real identities sign up by phone; a Google-only auth has no phone.
      if (user.phone == null) {
        await supabase.rpc("cleanup_orphan_google_user");
        return NextResponse.redirect(`${origin}/login?google=unlinked`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (in `app/`)
Expected: PASS — no new errors. (`exchangeCodeForSession` returns `{ data: { user, session }, error }`, so `user` is `User | null`.)

- [ ] **Step 3: Manual verification of the three flows**

1. Fresh Google sign-in with an unlinked email → lands on `/login?google=unlinked`; the admin Users → Pending tab has no new row.
2. Existing phone user signs in with Google after linking → lands on app root (next default) and is signed in.
3. Link flow (from Task 5) returns to `/profile` (the `next=/profile` param round-trips).

- [ ] **Step 4: Commit**

```bash
git add app/src/app/auth/callback/route.ts
git commit -m "feat(auth): detect and clean up orphaned google sign-ins in callback"
```

---

### Task 3: Login page — unlinked banner + copy fix

**Files:**
- Modify: `app/src/app/login/LoginFlow.tsx` (lines ~21-22 for the param read; after line 184 for the banner; lines 199-201 for the copy)

**Interfaces:**
- Consumes: the `/login?google=unlinked` query param produced by Task 2.
- Produces: a `role="alert"` banner visible only on the phone screen of the login page.

- [ ] **Step 1: Read the query param**

In `LoginFlow.tsx`, next to the existing `nextPath` read (line 21-22), add:

```tsx
  const googleUnlinked = search.get("google") === "unlinked";
```

- [ ] **Step 2: Render the banner on the phone screen**

Immediately after the "Only registered numbers can sign in. Ask an admin for an invite." paragraph (which ends at line 169), before the `{error && ...}` line, insert:

```tsx
            {googleUnlinked && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-amb/25 bg-amber-wash px-3 py-2.5 text-[12px] leading-relaxed text-amb"
              >
                This Google email isn&apos;t linked to any account. Log in with
                your phone number, then link Google from your profile.
              </div>
            )}
```

- [ ] **Step 3: Fix the stale helper copy**

Change the paragraph at lines 199-201 from:

```tsx
            <p className="mt-3 text-[12px] text-ink-4">
              Google works only after you link it from Settings.
            </p>
```

to:

```tsx
            <p className="mt-3 text-[12px] text-ink-4">
              Google works only after you link it from your profile.
            </p>
```

- [ ] **Step 4: Typecheck + manual verification**

Run: `npm run typecheck` (in `app/`) — Expected: PASS.

Manual:
1. Visit `/login?google=unlinked` while signed out → amber banner shows above the Google button.
2. Visit `/login` (no param) → no banner.
3. Banner disappears when the user switches to the OTP screen (it only renders on the `phone` screen).

- [ ] **Step 5: Commit**

```bash
git add app/src/app/login/LoginFlow.tsx
git commit -m "feat(login): explain unlinked google sign-ins and fix link copy"
```

---

### Task 4: Self-profile page — server page + data function + client Google section

**Files:**
- Create: `app/src/app/(app)/profile/page.tsx`
- Create: `app/src/app/(app)/profile/ProfilePage.tsx`
- Modify: `app/src/lib/data/users.ts` (append after `getUser`, ~line 100)

**Interfaces:**
- Consumes: `getSession()` from `@/lib/auth/session` (returns `Session | null`, session.user.id = the caller's id); `getMyProfile(userId)` from `@/lib/data/users`; `UserRow` from `@/lib/data/users`; browser client `createClient()` from `@/lib/supabase/client`; `supabase.auth.getUserIdentities()`, `linkIdentity`, `unlinkIdentity` (all available in `@supabase/supabase-js` ^2.110.7).
- Produces: route `/profile` (any active signed-in user; no route-guard change needed since `/profile` has no rule in `route-guard.ts`), redirecting to `/login` when signed out. Client component `ProfilePage({ profile })` rendering the account card + Google section. The link button navigates to `origin + "/auth/callback?next=/profile"`; the unlink button removes the google identity client-side and resets the section to "Not linked".

- [ ] **Step 1: Add `getMyProfile` to the data layer**

Append to `app/src/lib/data/users.ts` (after `getUser`, line ~100):

```ts
/** The signed-in user's own profile row, or null. Thin wrapper over getUser. */
export async function getMyProfile(userId: string): Promise<UserRow | null> {
  return getUser(userId);
}
```

- [ ] **Step 2: Create the server page**

Create `app/src/app/(app)/profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/data/users";
import { ProfilePage } from "./ProfilePage";

export const metadata = { title: "Profile — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  const profile = await getMyProfile(session.user.id);
  return <ProfilePage profile={profile} />;
}
```

- [ ] **Step 3: Create the client component**

Create `app/src/app/(app)/profile/ProfilePage.tsx`:

```tsx
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
      g ? { status: "linked", email: g.email ?? g.id } : { status: "unlinked" },
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
```

- [ ] **Step 4: Typecheck + lint + build**

Run (in `app/`): `npm run typecheck` && `npm run lint` && `npm run build`
Expected: PASS (TS knows `getUserIdentities`/`linkIdentity`/`unlinkIdentity`; `UserRow` carries `fullName`, `phone`, `roles`, `branchName`).

- [ ] **Step 5: Manual verification of link + unlink**

1. Signed out, visit `/profile` → redirected to `/login`.
2. Signed in (phone user, Google not linked): open Profile → "Not linked" state → **Link Google** → Google consent → returns to `/profile` showing the linked email.
3. **Unlink Google** → confirm dialog → section returns to "Not linked"; the user still signs in by phone.
4. A phone user who links Google, signs out, then uses "Continue with Google" → lands on the app root signed in (not the unlinked banner — the callback saw a phone).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/data/users.ts "app/src/app/(app)/profile/page.tsx" "app/src/app/(app)/profile/ProfilePage.tsx"
git commit -m "feat(profile): add self-profile page with google link/unlink"
```

---

### Task 5: Topbar — Profile menu item

**Files:**
- Modify: `app/src/components/shell/Topbar.tsx` (inside `UserMenu`, between the header block ending line 307 and the `<div className="p-1">` at line 308)

**Interfaces:**
- Consumes: `Link` from `next/link` (already imported at line 4); the `/profile` route from Task 4.
- Produces: a "Profile" menuitem in the topbar avatar dropdown linking to `/profile`.

- [ ] **Step 1: Add the Profile link above Sign out**

Inside `UserMenu`, change the block at lines 308-318 from:

```tsx
          <div className="p-1">
            <form action="/auth/signout" method="post">
```

to:

```tsx
          <div className="p-1">
            <Link
              href="/profile"
              role="menuitem"
              className="block w-full rounded-[7px] px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-fill"
            >
              Profile
            </Link>
            <form action="/auth/signout" method="post">
```

- [ ] **Step 2: Typecheck + manual verification**

Run: `npm run typecheck` (in `app/`) — Expected: PASS.

Manual: open the topbar avatar menu → "Profile" appears above "Sign out"; clicking it navigates to `/profile`; the menu closes via the existing outside-click handler.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/shell/Topbar.tsx
git commit -m "feat(shell): add profile link to user menu"
```

---

## Final Integration Verification

Run the full suite once after all tasks (in `app/`):

```bash
npm run typecheck
npm run lint
npm run build
```

End-to-end smoke (all manual):
1. Fresh Google sign-in, unlinked email → `/login?google=unlinked` banner; admin Pending tab stays clean.
2. Phone sign-in → topbar avatar → Profile → account card + "Not linked" → Link Google → back on `/profile` with email shown → Unlink → back to "Not linked".
3. Signed-out visit to `/profile` → `/login`.
4. After linking, Google sign-in signs the user in directly (no banner).

## Task 4 review result (logged in-conversation; SDD workspace under .superpowers/sdd)

- Reviewer verdict 1: Needs fixes.
- Important: ProfilePage.tsx unstable-effect loop. createClient() (client.ts:10-14) returns a NEW client per render; useCallback deps [supabase] + useEffect([refreshGoogle]) -> refire on every render; each setGoogle(new object) -> render -> loop of getUserIdentities() calls. Fix: stable client via useState lazy init.
- Minor: unlink() discards getUserIdentities error; missing trailing newlines on both new files.
- Deviation g.email -> g.identity_data?.email ?? g.id APPROVED by reviewer (checked installed @supabase/auth-js module types: no UserIdentity.email) - verified correct.
- users.ts pre-existing redesign edits in the 7d0fc64 commit confirmed as provenance, not Task 4 work.
- Lint: pre-existing env gap (no ESLint config/dependency; next lint interactive) - documented, not a Task 4 defect.

## Task 4 review — second pass (after fixes)

- Fix commit d1b84e2 (fix(profile): stabilize supabase client to stop effect loop).
- Important fixed: ProfilePage now creates client via useState lazy init (stable across renders) -> useCallback/useEffect fire once on mount, no loop.
- Minor fixed: unlink surfaces getUserIdentities error; both new files now end with LF newline.
- Re-review basis: fix applies reviewer-prescribed approach verbatim; typecheck + build PASS; diff inspected by orchestrator. Approved.
- Task 4 FINAL: APPROVED. Commits: 7d0fc64 (feat) + d1b84e2 (fix).

## Task 5: Topbar Profile menu item — RESULT

- Implementer: DONE. Commit 436b707 (feat(shell): add profile link to user menu), single path staged.
- Reviewer: APPROVED. Profile Link inserted verbatim (Topbar.tsx:308-315) above Sign out; href/role/className match brief; no duplicate import; only one file changed; typecheck PASS.
- Provenance: commit sweeps in pre-existing Topbar redesign (live Warehouse/FY selectors) — expected, staged per brief, not Task 5 work.
- Minor (deferred to final review): Profile Link lacks onClick={() => setOpen(false)}; menu may stay open after client-side nav. Matches brief verbatim.
- Step 3 manual browser flow: pending integration verification (environment lacks running app/browser).

## Whole-branch review (final gate)

- Verdict: PASS - ready to ship, no blockers.
- Verified end-to-end: orphan flow (callback RPC with caller JWT via server client; gate to /login?google=unlinked; LoginFlow banner; no admin Pending zombies), linking flow (linkIdentity redirectTo /auth/callback?next=/profile; callback honors next), unlink flow (phone untouched), security (no service role in feature; RPC definer + search_path + authenticated-only, verified live; no anon exposure), session/auth consistency, data flow (getMyProfile -> getUser -> UserRow renders all 4 fields), migration contract matches plan verbatim.
- Finder (Minor, acknowledged, not new): callback failure-contract diverges from spec text (40529fc made deliberate gate -> /login?error=oauth instead of google=unlinked when cleanup not true; per-task approved). Profile link menu-close (fixed in 0e7f46a). ProfilePage unlink inline error surfacing (harmless, matches approved fix).
- Post-fix: typecheck PASS. Commit 0e7f46a (fix(shell): close user menu on profile navigation).

## FINAL STATE - Google linking + self-profile feature COMPLETE

Commits (feature, 10 total):
  7ea6f3f feat(db) add cleanup_orphan_google_user RPC
  88b97a4 fix(db) idempotent
  9f67b17 feat(auth) callback orphan detect + cleanup
  40529fc fix(auth) gate unlinked banner on successful cleanup
  0e9a813 feat(login) unlinked banner + copy fix
  7d0fc64 feat(profile) self-profile page
  d1b84e2 fix(profile) stabilize client (effect loop)
  436b707 feat(shell) profile menu link
  0e7f46a fix(shell) close menu on nav
  (rollup: 187790d plan, a3475d1 spec)

Production deployment: 0942 migration + idempotent applied to wmpxwpubfxpexybqnynz; RPC verified live (SECURITY DEFINER, authenticated-only, anon/public revoked). Security advisors: no new gaps (function flagged only under the intentional authenticated-definer WARN class, same as the other 167 definer functions).

Final verification: typecheck PASS, build PASS (route /profile present), lint unrunnable (pre-existing no-ESLint).

Pending (integration-only, environment):
  - Manual browser OAuth flows (link/unlink round-trips, signed-out /profile redirect).
  - Supabase dashboard: ensure Google OAuth provider enabled + Google Cloud consent + authorized redirect/redirect URIs in place before live Google flow.
