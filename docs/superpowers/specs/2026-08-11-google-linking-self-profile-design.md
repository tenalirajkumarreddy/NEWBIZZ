# Google Linking + Self-Profile Design

Date: 2026-08-11

## Problem

Signing in with a Google account whose email is not yet linked to any NEWBIZZ
account silently fails from the user's point of view: a brand-new `auth.users`
row is created, the `handle_new_auth_user` trigger inserts a `public.users` row
with `status = 'pending_review'` and no phone, and the callback bounces the user
back to the login page with no explanation. The user is left stuck (their
Google account can never be signed into again) and a zombie "Pending" user
piles up in the admin Users tab.

There is also no way for a signed-in user to actually link a Google account to
their phone-based account, even though the login page claims Google works
"after you link it from Settings".

## Goal

- When a fresh Google email isn't linked to any account, tell the user clearly:
  log in with your phone number, then link Google from your profile.
- Provide a self-profile page (reachable from the topbar avatar menu) where a
  signed-in user can link and unlink their Google account.
- Keep the admin Pending queue free of orphaned Google rows.

## Out of Scope

- Editing name or any other field on the profile page.
- Unlinking the phone identity (phone OTP is the primary identity).
- Email/password authentication.
- Profile features beyond Google linking (no holdings/activity on the profile).

## Approach

Orphan detection happens in the OAuth callback. Cleanup runs as the user's own
session through a narrowly-guarded security-definer RPC (no service key).
Linking/unlinking use the standard GoTrue `linkIdentity` / `unlinkIdentity`
client APIs. Google state is shown from `supabase.auth.getUserIdentities()`.

## Architecture & Components

### 1. OAuth callback (`app/src/app/auth/callback/route.ts`)

After `exchangeCodeForSession`:

- Read the returned user. If `user.phone` is `null` (the orphan signal; phone
  is always present for phone signups and never for a fresh Google auth), call
  the new RPC `cleanup_orphan_google_user()` using the same `supabase` client,
  then redirect to `/login?google=unlinked` (never to `next`, since the user is
  not a usable app user).
- Otherwise keep the existing behavior: redirect to `next` (default `/`).
  This is what lets `/auth/callback?next=/profile` (used by linking) land the
  user back on their profile page.

### 2. RPC `cleanup_orphan_google_user()` (new migration)

Security definer, `set search_path = ''`, fully-qualified table names.

Guards:
1. `auth.uid()` is non-null.
2. The caller's `public.users` row exists and has `phone IS NULL`.

On success:
1. `delete from public.users where id = auth.uid()`
2. `delete from auth.users where id = auth.uid()`

Returns `boolean`. Orphans are brand-new, so no child rows exist to block the
delete under FK constraints. The RPC bypasses RLS internally but can only ever
delete the caller's own orphaned row.

### 3. Login banner (`app/src/app/login/LoginFlow.tsx` + page)

- `/login?google=unlinked` renders a warning alert:
  "This Google email isn't linked to any account. Log in with your phone
  number, then link Google from your profile."
- Update the stale helper copy near the Google button ("...from Settings" →
  "...from your profile").

### 4. Self-profile page (`app/(app)/profile/page.tsx`)

- `/profile` already has no rule in `lib/auth/route-guard.ts`, so it is open to
  any active user; no guard change needed.
- Server page fetches the current user's `public.users` row via a small
  `getMyProfile()` data function (identity card: name, phone, role, branch,
  joined date).
- `ProfilePage` client component renders:
  - Identity card.
  - Google section:
    - **Not linked**: explanation + "Link Google" button →
      `supabase.auth.linkIdentity({ provider: "google", options: { redirectTo:
      origin + "/auth/callback?next=/profile" } })`.
    - **Linked**: show the linked Google email from
      `supabase.auth.getUserIdentities()` + "Unlink Google" with a confirm step
      → `supabase.auth.unlinkIdentity(googleIdentity)`. Safe because a phone
      identity always remains (GoTrue refuses to remove the last identity).

### 5. Topbar (`app/src/components/shell/Topbar.tsx`)

- Add a "Profile" item to the UserMenu dropdown (~line 268) pointing at
  `/profile`.

## Data Flow

1. **Fresh Google sign-in (unlinked email)**: login page → Google → callback →
   `phone IS NULL` → `cleanup_orphan_google_user()` → `/login?google=unlinked`
   → banner.
2. **Link**: signed-in user → profile → "Link Google" → Google → callback
   (`next=/profile`) → phone present, no cleanup → `/profile` shows linked
   email.
3. **Unlink**: profile → confirm → `unlinkIdentity` → Google section returns to
   not-linked state.

## RLS

- The only schema change is the new definer RPC.
- Self-read is already covered: migration `0004_rls_policies.sql` grants
  `read_users on users for select to authenticated using (true)`, so the
  profile page's server fetch of the caller's `public.users` row works without
  any new policy.

## Error Handling

- Callback exchange failure: existing redirect to `/login?error=oauth`.
- Link failure (e.g., Google email already belongs to another account): handled
  by the callback's existing `?error=` path; the banner covers the common case.
- Unlink failure (e.g., last identity): inline error on the profile page; no
  destructive side effects.
- Cleanup RPC failure: still redirect to `/login?google=unlinked` so the user
  gets the message; worst case an orphan row lingers in admin Pending.

## Testing

Manual flows:
1. Phone signup → open profile → link Google → linked email shows → unlink →
   back to not-linked.
2. Fresh Google sign-in with an unlinked email → login page shows banner, no
   zombie in admin Pending.
3. Signed-in user visits `/profile` → identity card renders; signed-out →
   redirected to login.

Commands: `npm run typecheck`, `npm run build`.
Post-migration: run security advisors to confirm the new RPC introduces no RLS
gaps.
