# NEWBIZZ — Platform Architecture Plan
## Auth · Fine-Grained Access Control · Security · Notifications · Realtime · Performance

**Status:** Planning (pre-implementation). DB is complete through Phase 4 (migrations 0001–0027 + 0029).
**Decisions locked (this session):**
- **Auth:** Phone is mandatory at sign-up; Google can be linked later. Login = phone OTP **or** Google (if linked).
- **Access model:** Roles (base) + per-user grant/deny overrides + instant kill-switch.
- **Enforcement:** DB (RLS + SECURITY DEFINER RPCs) is the only security boundary; JWT/cached claims are a UI-speed convenience, never trusted for authorization.

This plan honors the **Nine Invariants**. Nothing here lets the app write money/stock outside a definer RPC.

---

## 0. The identity linchpin (read first)

`current_app_user()` = `nullif(current_setting('request.jwt.claim.sub',true),'')::uuid`.
`has_permission()`, every RLS policy, and every RPC's `v_actor` derive identity from the JWT `sub`.

**Therefore `public.users.id` MUST equal the Supabase Auth user id (`auth.uid()`).**
This is the single most important integration rule. Everything below depends on it. A row in `public.users` is the *application profile*; the matching row in `auth.users` is the *credential*. They share one UUID.

---

## 1. Authentication & Onboarding

### 1.1 Providers
| Provider | Role | Notes |
|---|---|---|
| **Phone OTP** | Mandatory identity | SMS OTP via Supabase Auth. Phone is the primary key of a person's identity. **Delivered through httpSMS (self-hosted/hosted) via a Send SMS Auth Hook — see §1.1a.** |
| **Google OAuth** | Optional, linked later | A signed-in user links Google from Settings → identity added to the same `auth.users` row via `supabase.auth.linkIdentity()`. Login thereafter via either factor. |

Email/password is **not** a login method. `users.email` remains a contact/notification field only.

### 1.1a SMS delivery via httpSMS (Send SMS Auth Hook)
**Do NOT** try to select httpSMS in Supabase Auth's SMS provider config — Supabase natively supports only Twilio / Vonage / MessageBird / Textlocal. httpSMS integrates through the **Send SMS Hook** instead:

```
Supabase Auth (OTP requested)
        │  invokes the enabled "Send SMS" hook with { user, sms:{otp}, phone }
        ▼
Edge Function  send-sms-hook   (Deno; JWT/hook-secret verified)
        │  POST https://api.httpsms.com/v1/messages/send
        │  headers: x-api-key: {HTTPSMS_API_KEY}      (Edge Function secret)
        │  body: { from: HTTPSMS_FROM, to: phone,
        │          content: "Your NEWBIZZ code is {otp}. Valid 5 min." }
        ▼
httpSMS  → routes the SMS through the paired Android phone (their app) → user
```

- **Config lives in Edge Function secrets**, not Auth provider settings:
  `HTTPSMS_API_KEY`, `HTTPSMS_FROM` (the paired phone's E.164 number), `SEND_SMS_HOOK_SECRET`.
- **Auth side:** enable the "Send SMS" hook and point it at the `send-sms-hook` function; verify the hook secret inside the function so only Supabase Auth can invoke it.
- **API contract (verified):** `POST https://api.httpsms.com/v1/messages/send`, auth header `x-api-key`, JSON `{from,to,content}` in E.164; 401 without a key; success returns `{status:"success"}`. Optional `request_id` for idempotency — set it to the OTP request id.

**Operational caveats (accepted trade-offs for an internal, low-volume app):**
1. **Single-phone dependency** — every OTP flows through one Android phone; if it's off/offline, logins stall. Mitigation: keep the gateway phone charged/online (mains power, stable Wi-Fi); monitor with httpSMS heartbeat; consider a fallback provider env-flag.
2. **Carrier P2P limits** — Indian SIMs throttle person-to-person SMS (~100–200/day) and may spam-flag repetitive OTP text. Fine for a fixed staff roster; will not scale to public/high volume.
3. **DLT** — P2P-via-own-SIM sits outside the commercial DLT bulk framework; acceptable at low volume, not a promotional/transactional bulk route.
4. **Swappability (design requirement)** — `send-sms-hook` isolates the provider behind one function. Swapping httpSMS for Twilio/MSG91 later = re-implement that one function; **no change** to the auth model, users table, or claims. Build it provider-agnostic from day one.

> Because OTP delivery is now a self-managed dependency, treat the gateway phone as production infrastructure. For break-glass admin access, keep Google-linked admin accounts so an admin can always get in without SMS.

### 1.2 Sign-up flow (invite-first, not open)
This is an internal business app — **no public self-serve signup**. Two-track:

**A. Admin provisions the person (preferred):**
1. Admin (holds `roles.manage`) creates a `public.users` row via a new `admin_create_user(phone, full_name, role_code, branch_id)` RPC → inserts the profile in a **`pending_activation`** status with a server-generated UUID, assigns role(s). No `auth.users` row yet.
2. On first login the person enters that phone → Supabase sends OTP → on verify, an `auth.users` row is created **with a fresh UUID that will NOT match the profile**. This is the classic mismatch trap.

**Resolution (the bridge):** a `handle_new_auth_user()` trigger on `auth.users` (AFTER INSERT) that **reconciles by phone**:
   - If a `public.users` row exists with the same phone and status `pending_activation` → **re-key** is impossible (id is FK'd everywhere), so instead we reverse the order: admin_create_user does NOT mint the id; the profile is created *keyed to the auth id* at first login.

**Cleaner model we will implement (avoids re-keying):**
   - `admin_create_user` writes to a staging table **`user_invitations`** (phone, full_name, intended roles, branch, invited_by, token, expires_at) — NOT to `public.users`.
   - Trigger `handle_new_auth_user()` on `auth.users` AFTER INSERT:
     1. `insert into public.users (id, full_name, phone, email, status) values (NEW.id, …, 'active')` — id = auth id, invariant satisfied.
     2. If a matching **non-expired** `user_invitations` row exists for `NEW.phone`: copy full_name/branch, apply its `user_roles`, mark invitation consumed.
     3. Else: create the profile in status **`pending_review`** with **zero roles** (can log in, can do nothing until an admin assigns a role). This prevents an unknown phone from gaining any access.

**B. Self sign-up (only if enabled):** same trigger path, always lands in `pending_review` with no roles. Default: **disabled** in Supabase Auth settings; invitation-only.

### 1.3 Session & token lifetime
- Access token (JWT) TTL **1 hour**, refresh token rotation ON.
- Field PWA: long-lived refresh token (persisted in IndexedDB via Supabase client) so agents aren't re-authing mid-route. Offline = read/capture-intent only (per Invariant/Phase-4 offline model); money never posts offline.
- **Kill-switch propagation:** suspending a user must take effect within one access-token lifetime. We shorten effective exposure with a `token_version` claim (see §2.4) + server-side revocation on suspend.

### 1.4 Custom claims at token mint (Auth Hook)
Supabase **Custom Access Token Hook** (Postgres function `auth.custom_access_token_hook(event jsonb)`) runs on every token issue/refresh. It injects app claims so the client and RLS can read them cheaply:
```
claims.app_metadata.roles          = ['manager', ...]         -- role codes
claims.app_metadata.perms          = ['order.create', ...]    -- effective permission codes (post-override)
claims.app_metadata.branch_id      = uuid
claims.app_metadata.user_status    = 'active' | 'suspended' | 'pending_review'
claims.app_metadata.token_version  = int                      -- bumped to force-refresh
claims.app_metadata.is_admin       = bool
```
> These claims are a **cache for UI + cheap RLS reads**. The authoritative check remains `has_permission()` inside definer RPCs, which reads live tables. If a claim is stale, the RPC still refuses — security holds; only the UX is briefly optimistic.

---

## 2. Fine-Grained Access Control (roles + overrides + kill-switch)

### 2.1 What exists today (live)
- `permissions` (16 codes), `roles` (with special `admin`), `role_permissions(role_id, permission, scope)`, `user_roles(user_id, role_id)`.
- `has_permission(code)`: admin bypasses everything; others pass if any of their roles grants the code with `scope <> 'none'`.
- `scope` currently only ever `'all'`. **We will give `'none'` a meaning: an explicit deny at the role level** (already supported by the existing `<> 'none'` check — forward-compatible, no core change needed for role-level deny).

### 2.2 New: per-user overrides (immediate, unpredictable control)
New table **`user_permission_overrides`**:
```
user_id      uuid  -> users(id)
permission   text  -> permissions(code)
effect       text  check (effect in ('grant','deny'))
reason       text
granted_by   uuid  -> users(id)
expires_at   timestamptz null      -- optional auto-expiry for temporary access
created_at   timestamptz
unique (user_id, permission)
```
Semantics (deny wins): a user can be handed a single capability their role lacks, or have one surgically removed, without touching roles that affect everyone else.

### 2.3 New: instant kill-switch
- Add `users.status` values: `active`, `suspended`, `pending_review`, `pending_activation`, `disabled`.
- **`suspended`/`disabled` ⇒ zero permissions, regardless of roles/overrides.**

### 2.4 Redefine `has_permission()` (one migration, backward compatible)
New precedence, evaluated in `has_permission(p_code)`:
```
1. user suspended/disabled?            -> FALSE (hard stop)
2. explicit user override for p_code?  -> use it (deny=FALSE, grant=TRUE), honoring expires_at
3. admin role?                         -> TRUE
4. any role grants p_code (scope<>'none')? -> TRUE
5. else                                -> FALSE
```
Still `STABLE SECURITY DEFINER`, still reads live tables → overrides & suspension are effective **immediately** on the next RPC/RLS evaluation, independent of any cached JWT claim.

Supporting RPCs (all gated by `roles.manage`; all write `audit_log`):
- `admin_set_user_status(user, status, reason)` — kill-switch; also bumps `token_version`.
- `grant_user_permission(user, code, expires_at?, reason)` / `revoke_user_permission(...)` (upserts an override).
- `assign_role(user, role_code)` / `unassign_role(...)`.
- `admin_create_role(code, name)` + `set_role_permission(role, code, scope)` — lets admin build **custom roles** and toggle capabilities live.
- `get_my_permissions()` (SECURITY DEFINER, returns the caller's effective codes) — the UI's on-load fetch and the claim-refresh source.
- `bump_token_version(user)` — invalidates cached claims; forces the client to refresh (see §2.5).

### 2.5 Making cached claims honest
- `users.token_version int not null default 0`.
- Any override/suspension/role change bumps `token_version`.
- Custom-token hook writes `token_version` into the JWT.
- Client compares its claim's `token_version` to a lightweight `get_my_token_version()` (or a realtime signal on the user's own row); on mismatch it calls `supabase.auth.refreshSession()` → new claims. Worst case staleness = one refresh cycle; the **DB never trusts the stale claim** anyway.

### 2.6 Admin control surface (UI)
A "Users & Access" console (visible only with `roles.manage`):
- User list with status chips, roles, last login; one-click **Suspend / Reactivate**.
- Per-user permission matrix: role-derived (read-only) vs overrides (toggle grant/deny, optional expiry).
- Role editor: create custom roles, toggle the 16 (or more) permission codes.
- Every action is optimistic in UI, authoritative in DB, and audited.

---

## 3. Application Security (defense in depth)

| Layer | Control |
|---|---|
| **Transport** | HTTPS only; HSTS. Supabase enforces TLS. |
| **AuthN** | Supabase Auth (phone OTP / Google). No passwords stored by us. |
| **Identity integrity** | `public.users.id = auth.uid()` enforced by the new-user trigger; a periodic check RPC asserts no orphans/mismatches. |
| **AuthZ (hard boundary)** | RLS on every table (already enabled) + all money/stock mutations via SECURITY DEFINER RPCs (Invariant 3). `has_permission()` inside. |
| **Least privilege** | `anon`/`public` have **no** EXECUTE (0012/0028/0029 hardening); only `authenticated` can call gated RPCs; each RPC re-checks permission. Re-run hardening after every function-adding migration. |
| **search_path pinning** | Every function `SET search_path = public` (prevents definer hijack). |
| **Input validation** | RPCs validate types/ranges; jsonb parsed defensively; FKs enforce referential truth. |
| **Auditability** | `write_audit()` on every mutation/approval (Invariant 7). Admin access changes audited too. |
| **Immutability** | Posted entries never mutated; reverse-only (Invariant 6). |
| **Secrets** | Service-role key server-side only (never shipped to client/PWA). Anon/publishable key is the only client key. **Rotate the leaked PAT `sbp_c3d2b1f6ee41…`.** |
| **Storage** | `documents` bucket is **private**; access via signed URLs minted server-side after an RLS/permission check. Bucket policy mirrors table visibility. |
| **Rate limiting / abuse** | Supabase Auth OTP rate limits; consider an Edge Function throttle on sensitive RPCs. |
| **PII** | Phone/email minimal; audit stores actor id, not credentials. |
| **RLS regression guard** | A smoke test that asserts a low-priv user is refused each gated RPC and each cross-tenant read. |

---

## 4. Notifications

### 4.1 What exists (Phase 4, migration 0027)
`notifications` table (in-app queue: user_id, title, body, severity, category, entity_type/id, action_url, delivery_channel, status, sent_external), `notify(user, title, opts)`, `mark_notifications_read(ids?)`. RLS: a user reads only their own rows; writes via definer RPCs only. External dispatch (WA/SMS/email) intentionally deferred.

### 4.2 How notifications flow (end to end)
```
Event source ─┐
 (RPC, trigger, scheduled scan)   e.g. license_expiry_scan, target miss,
              │                        complaint assigned, cheque bounced,
              │                        payroll ready, approval needed
              ▼
        notify(user, title, {severity, category, entity_type, entity_id,
                             action_url, delivery_channel})
              │  (writes one row; in_app always exists)
              ├──────────────► in_app  → Realtime push to that user (see §5) → bell badge
              └── if delivery_channel ∈ {whatsapp,sms,email} and not sent_external:
                       a dispatch worker (Edge Function, cron) picks it up,
                       sends via provider (deferred), sets sent_external + sent_at
```

### 4.3 Producers we will wire (all already have DB hooks or scans)
- **License expiry** → `license_expiry_scan` (daily) → `notify(..., category:'license', severity by proximity)`.
- **CRM follow-ups / complaint status** → on `interactions`/`complaints` insert/update.
- **Targets & commissions** → after `compute_commissions` / target shortfall.
- **Payroll** → run computed / salary paid.
- **Bank** → cheque bounced, unmatched statement lines aging.
- **Approvals** → any doc needing a higher role (uses `roles.manage`/domain perms to pick recipients).

### 4.4 Delivery channels
- **in_app**: always. Realtime + bell. Read/archive via `mark_notifications_read`.
- **whatsapp/sms/email**: enqueue now, dispatch later via a channel worker (WhatsApp Business Cloud API, DLT SMS, transactional email). The row + `delivery_channel` + `sent_external` flag are the durable queue; provider wiring is a separate implementation task (documented deferral, not stubbed in DB).
- **Preferences**: add `notification_preferences(user_id, category, channel, enabled)` so users/admin can mute categories per channel. Default sensible (critical always in_app).

### 4.5 Client UX
- Bell with unread count (from a `count(*) where status='unread'` on the user's own rows, kept live by Realtime).
- Dropdown list, severity color, deep-link via `action_url`.
- Toast for `critical`/`success` arriving live.

---

## 5. Realtime Subscriptions

### 5.1 Current state
`supabase_realtime` publication is **empty** — nothing is published yet. We add tables deliberately (never blanket-publish; RLS still applies to realtime, but least surface is safer + cheaper).

### 5.2 What to publish (and why)
| Table | Who subscribes | Filter | Purpose |
|---|---|---|---|
| `notifications` | each user | `user_id = auth.uid()` | live bell / toasts |
| `route_sessions`, `visits` | managers, ops dashboard | branch/route | live field tracking |
| `sales_orders`, `invoices` (status) | ops/accounts dashboards | branch | live pipeline |
| `complaints` | customer-care | status/open | live queue |
| `users` (own row) | each user | `id = auth.uid()` | token_version bump → refresh claims |
| optional: `stock` low-level | inventory dashboard | item/branch | live stock (throttle) |

### 5.3 Rules & safeguards
- **RLS governs realtime**: a client only receives change events for rows its `SELECT` policy allows. Our existing read policies already gate this. Verify each published table has a correct SELECT policy (they do).
- **Publish only needed columns / operations** where possible; avoid publishing high-churn value tables (`journal_lines`, `account_balances`) — dashboards read those via RPC/materialized reads on demand, not live streams.
- **Channel design**: per-user channel for notifications (`user:{id}`), per-branch topic channels for dashboards. Authorize channels with RLS + (optionally) Realtime Authorization policies.
- **Backpressure**: debounce/coalesce UI updates; for busy dashboards, subscribe to a summarized view or poll a cached read-model rather than every row event.
- **Presence** (optional): agent online/offline for the ops map via Realtime Presence.

---

## 6. Performance

### 6.1 Database
- **Indexing**: the advisor lists INFO-level unindexed FKs. Add covering indexes on FKs that are actually queried hot (notifications.user_id ✓ present; visits, route_sessions, journal_lines.entry_id/account_id, receipt/payment allocations). Skip indexes on cold/empty tables until data justifies.
- **Read-models**: `account_balances` and other cached balances are rebuildable read-models (Invariant 5) — reports read them, not raw `journal_lines`. Add materialized views for heavy dashboards (trial balance, AR/AP aging, sales-by-route) refreshed on a schedule or after posting.
- **RPC efficiency**: definer RPCs already do set-based work; keep loops bounded. `has_permission()` is `STABLE` so it's cached within a statement.
- **Connection mgmt**: use Supabase's pooler (PgBouncer, transaction mode) for the Next.js server; keep RPCs short (one transaction each — Invariant 4).

### 6.2 Application (Next.js)
- **Server Components + RSC data fetching** for authenticated pages; use the user's JWT (RLS-scoped) server-side, never the service key for user data.
- **Claims-driven UI gating**: read `perms` from the session claims to show/hide instantly; still every mutation goes through an RPC that re-checks.
- **Caching**: cache masters (COA, items, roles, permission catalog) with tag-based revalidation; per-user data uncached.
- **PWA**: precache shell; runtime-cache read data; offline capture-intent queue that replays through RPCs when back online (money/stock always server-authoritative).
- **Payload discipline**: paginate ledgers/lists; select only needed columns; avoid N+1 by using views/RPCs that return shaped rows.

### 6.3 Realtime cost control
- Publish minimal tables (§5.2); per-user + per-branch filters; coalesce UI updates; prefer read-model polling for high-churn dashboards.

---

## 7. New DB objects this plan introduces (summary)
| Migration | Adds |
|---|---|
| `0030_auth_bridge.sql` | `user_invitations`; `handle_new_auth_user()` trigger on `auth.users`; `admin_create_user`, invitation RPCs; users.status enum-widening + `token_version`; identity-integrity check RPC |
| `0031_access_overrides.sql` | `user_permission_overrides`; **redefine `has_permission()`** (suspend→override→admin→role); `grant/revoke_user_permission`, `admin_set_user_status`, `assign/unassign_role`, `admin_create_role`, `set_role_permission`, `get_my_permissions`, `bump_token_version`; audit on all |
| `0032_auth_token_hook.sql` | `auth.custom_access_token_hook()` injecting roles/perms/branch/status/token_version/is_admin; grants for the auth admin role |
| `0033_notification_prefs.sql` | `notification_preferences`; helper to resolve recipients by permission; extend `notify` to honor prefs |
| `0034_realtime_publication.sql` | add the §5.2 tables to `supabase_realtime`; verify SELECT policies |
| `0035_perf_indexes.sql` | hot-path FK/covering indexes; optional materialized read-models + refresh |
| re-run hardening | after 0030–0035, re-pin search_path + revoke anon/public (idempotent) |
| `0941_smoke_access_control.sql` | sentinel-rollback: suspend blocks all; override grant/deny/ expiry; admin bypass; role change effect; notify+prefs; identity bridge |

---

## 8. Implementation order (confirmed)

### Track A — Database (migrations, in strict order)
1. **0030 Auth bridge + trigger** — `user_invitations`, `handle_new_auth_user()`, `admin_create_user`, status widening + `token_version`, identity-integrity check. *Nothing works without `users.id = auth.uid()`.*
2. **0031 Access overrides + `has_permission()` rewrite** — overrides table, precedence (suspend→override→admin→role), all admin RPCs. Smoke-test hard.
3. **0032 Custom-token hook** — `auth.custom_access_token_hook()` injecting claims; then enable it in Supabase Auth settings.
4. **0033 Notification prefs + recipient resolver**.
5. **0034 Realtime publication** — add §5.2 tables to `supabase_realtime`; verify SELECT policies.
6. **0035 Perf indexes + read-models**.
7. **Re-harden** (idempotent search_path + revoke anon/public over new functions), **0941 access-control smoke** (sentinel-rollback), re-run advisors, confirm zero transaction rows remain.

### Track B — Edge Functions & Auth config (parallelizable with A after 0030)
8. **`send-sms-hook` Edge Function** (httpSMS) — Deno function verifying the hook secret, POSTing to `https://api.httpsms.com/v1/messages/send`; provider isolated behind one module for swappability. Set secrets `HTTPSMS_API_KEY`, `HTTPSMS_FROM`, `SEND_SMS_HOOK_SECRET`. Pair the httpSMS Android gateway phone. Enable the **Send SMS Hook** in Supabase Auth → this function.
9. **Auth settings** — phone provider ON, email/password OFF, Google OAuth configured, self-signup OFF (invitation-only), OTP template text, token TTL 1h + refresh rotation.

### Track C — Next.js app (after A2 + B are live)
10. Supabase client + **middleware session refresh**; server-side RLS-scoped fetching.
11. **Login**: phone-OTP screen → verify; **link Google** from Settings (`linkIdentity`).
12. **Route protection** reading claims (`perms`/`user_status`/`token_version`); stale-claim → `refreshSession()`.
13. **Admin "Users & Access" console** (§2.6): provision/invite, suspend/reactivate, per-user override matrix, custom-role editor — optimistic UI, authoritative DB.
14. **Notification bell + Realtime** channels (§4.5/§5).
15. **Dashboards** (read-models + selective Realtime) → then feature screens against the Phase 0–4 RPCs.

> Gate: begin Track C only after 0941 passes and the token hook is verified issuing claims. Money/stock screens always post through existing definer RPCs — no direct writes.
