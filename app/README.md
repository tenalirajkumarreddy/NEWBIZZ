# NEWBIZZ — Business Management System

Water-bottle manufacturing + retail/wholesale distribution (South India, GST-registered).
Stack: **Next.js (App Router) + Supabase (PostgreSQL, Auth, RLS, Storage, Realtime, Edge Functions) + PWA**.

This repo is being built **database-first**, in the priority order set by the master build plan
(`../docs/superpowers/specs/2026-07-17-master-build-plan.md`, §9 Build Order). The accounting core
is built before any commerce, because every sale, stock move, and production entry posts through it.

---

## Live status & production runbook

**Live project:** `wmpxwpubfxpexybqnynz` (ap-southeast-1). All migrations `0001` → `0093` are
applied. Build + typecheck are green. The app is deployed to Vercel from `main`.

### Shipped modules (beyond the README table below, which is historical)

Orders + delivery challans, sales/invoicing (official + unofficial, GST + e-invoice/e-way fields),
sales returns, collections & **payment intents** (portal), credit notes + schemes, customer
portal (`/portal`, migration 0091), pricing/rate master, credit limits, reorder alerts,
purchasing (PO → GRN → bills, AVL/debit notes, 3-way), supplier payments, GSTR-2B ITC,
BOM/alternate groups, production runs + **job cards** + reversal, process costing,
bank reconciliation + cheques + credit-card accounts, **Documents Vault** (private Storage),
licenses, assets/depreciation, loans/EMI, expenses/petty cash, fleet (vehicles/trips/fuel + GPS),
CRM, targets & commissions, payroll, notifications (+ preferences), WhatsApp Phase 1/2
(receiver, inbox, templates, value-event dispatch worker), admin (users/roles/overrides/audit/
settings/production devices), global search, and the production counter (ESP32) integration.

### Manual dashboard steps still required before go-live

These cannot be done from the repo — they are Supabase Auth settings:

1. **Enable the Send SMS Hook** (Auth → Hooks → Send SMS) pointing at the deployed
   `send-sms-hook` Edge Function — required for phone-OTP login.
2. **Enable the Custom Access Token Hook** (Auth → Hooks → Customize Access Token) — injects
   `roles`/`perms`/`user_status`/`token_version`/`portal_customer_id` claims. Without it, the
   portal and permission gating will not work.
3. Enable **compromised-password check** (Auth → Security) and enforce **MFA** for admin/manager.
4. WhatsApp: dry-run is on by default; flip it off in Admin → WhatsApp once Meta approves
   templates. Set `META_APP_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` in Vercel.

### Scheduled jobs (Vercel cron, `vercel.json`)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/notifications` | daily 02:15 UTC | license expiry / stale transfers / EMIs due |
| `/api/cron/whatsapp` | every 10 min | WhatsApp dispatch worker (drains the queue) |
| `/api/intangles/poll` | every 5 min | Intangles telemetry poll → `vehicle_gps_logs` + auto trips/fuel refills |

> Note: sub-daily cron intervals require a Vercel **Pro** plan (Hobby is daily-only). Both routes
> are guarded by `Authorization: Bearer $CRON_SECRET`.

---

## The Nine Invariants (never violate these)

1. `journal_lines` is the **only** source of truth for money and stock *value*.
2. `stock` + `user_stock_holdings` are the only source of truth for physical *quantity*.
3. All money/stock mutations go through a **server RPC** — never a direct table write from the app.
4. Every RPC is **one transaction** (all-or-nothing).
5. Cached balances (`account_balances`, ledger outstanding, …) are **read-models** — rebuildable, never authoritative.
6. Posted/audited entries are **immutable** — correct with reversing entries, never by mutation.
7. Every mutation and approval writes `audit_log`.
8. Number series are **gap-free per financial year**, allocated under a row lock.
9. Timestamps stored in **UTC**; business logic runs in **Asia/Kolkata (IST)**.

If a change would break one of these, it is wrong — stop and rethink.

---

## Layout

```
app/
  supabase/
    migrations/     -- ordered SQL migrations (0001_, 0002_, …). Apply in filename order.
    functions/      -- Supabase Edge Functions (Deno) — e.g. send-sms-hook
    seed/           -- seed data (roles, permissions, chart of accounts, company row, FY)
    tests/          -- smoke-test SQL proving invariants hold
  src/
    app/            -- Next.js App Router: /login, /pending, auth routes, and the (app) group
    components/     -- shell (Sidebar/Topbar/StatusBar/AppShell), auth widgets
    lib/            -- supabase client trio, auth claims/session/phone helpers
  docs/             -- implementation notes specific to the code (conventions, decisions)
```

## Migration order (Phases 0–4)

> The table below is the **historical** Phase 0–4 build record (0001–0035 + the smoke set).
> Migrations `0036` → `0093` (purchasing refinements, opening-stock, holdings, GSTR-2B, manual
> vouchers, assets/loans, expenses, notifications, WhatsApp, Documents, job cards, customer
> portal, payment intents, perf/security hardening) are not individually listed here — apply them
> in filename order; each carries its own header comment.

| File | Contents |
|---|---|
| `0001_foundation.sql` | company_settings, branches, financial_years, users, roles, permissions, role_permissions, user_pay_config, audit_log, number_series |
| `0002_accounting_core.sql` | chart_of_accounts, journal_entries, journal_lines, account_balances, cost_centers + immutability/balance guards |
| `0003_core_rpcs.sql` | `next_number()`, `post_journal()`, `write_audit()`, `assert_trial_balance()` |
| `0004_rls_policies.sql` | RLS enabled on all tables + baseline role-based policies + `has_permission()` helper |
| `0005_catalog.sql` | units, item_categories, items (HSN, GST rate), price_lists + price_list_items; wires journal_lines.stock_item_id FK |
| `0006_customers.sql` | customers, customer_stores (store-centric hierarchy), opening-balance RPC |
| `0007_stock.sql` | stock (qty truth, Inv 2), stock_ledger, weighted-average `post_stock_move()` RPC, reconcile view |
| `0008_sales.sql` | sales_orders, invoices (+GST CGST/SGST/IGST), `place_order()`, `post_invoice()` — issues stock at WAC + posts revenue |
| `0009_collections.sql` | customer_receipts, receipt_allocations, `record_receipt()`; Phase 1 RLS policies |
| `0012_security_hardening.sql` | security_invoker view, pin `search_path`, revoke anon/public EXECUTE on all functions |
| `0013_suppliers.sql` | suppliers (buy-side party), `supplier_opening_balance()`; RLS |
| `0014_purchases.sql` | GRNI account 2115, purchase_orders, purchase_receipts (GRN), `place_purchase_order()`, `post_grn()` — stock IN at WAC |
| `0015_supplier_bills.sql` | supplier_bills (+Input GST 1140), `post_supplier_bill()`, `post_bill_from_grn()` — clears GRNI, raises AP |
| `0016_supplier_payments.sql` | supplier_payments, payment_allocations, `pay_supplier()`; Phase 2 RLS |
| `0017_bom.sql` | alternate_groups, boms, bom_lines (date-range versioned recipes); `upsert_bom()`, `active_bom_for()`, `explode_bom()`, `bom_standard_cost()` — master data, no ledger |
| `0018_production.sql` | accounts 5170 Mfg Wastage + 1225 Production Clearing, production_runs, production_run_inputs; `post_production_run()` — atomic WAC consume→produce, clearing nets to zero |
| `0019_process_costing.sql` | cost_accounts_tag, overhead_pools, costing_runs, costing_run_lines, product_cost_snapshots; `run_process_costing()`, `compute_loaded_cost()`, `set_cost_account_class()` — weighted-average COGM |
| `0020_licenses.sql` | licenses register (FSSAI/BIS/PCB/…), `licenses_due()`, `license_expiry_scan()` — statutory renewal alerts, no ledger |
| `0021_field_force.sql` | routes, customer_store_routes, route_sessions, visits (GPS, no money), vehicles, trips, fuel_logs; `post_fuel_log()` (Dr 5540/Cr cash\|bank), `vehicle_running_cost()` |
| `0022_crm.sql` | leads, interactions, complaints, campaigns, campaign_results; `convert_lead()` — money-free CRM |
| `0023_credit_notes_schemes.sql` | account 5180 Scheme Rebates, credit_notes, schemes (GST-adjusted flag), scheme_eligibility; `_post_credit_note()`, `calc_scheme_eligibility()`, `post_scheme_credit_note()`, `post_complaint_credit_note()` — AR-reducing credit notes |
| `0024_targets_commissions.sql` | account 2135 Commission Payable, sales_targets, commission_rules, commission_runs/lines; `compute_commissions()` (from actual journals), `post_commission_run()` (Dr 5530/Cr 2135), `target_achievement()` |
| `0025_bank_reconciliation.sql` | bank_accounts, csv mapping, statement imports, bank_transactions, matches, reconciliation_adjustments, cheque_registry; `import_bank_statement()` (idempotent dedup), `match_bank_txn()`, `post_reconciliation_adjustment()`, `bank_reconciliation()`, `register_cheque()`/`set_cheque_status()`/`bounce_cheque()` |
| `0026_payroll.sql` | attendance, payroll_runs/lines; `compute_payroll()` (prorated from attendance + pay config), `post_payroll_run()` (Dr 5500/Cr 2130), `pay_payroll_line()` |
| `0027_notifications_documents.sql` | notifications (in-app queue; WA/SMS/email dispatch deferred), documents (private Storage metadata); `notify()`, `mark_notifications_read()` |
| `0029_journal_number_series_fix.sql` | **Fix:** `post_journal()` now draws `entry_no` from a single per-FY `journal` series (prefix JV) instead of the per-doc-type counter, so credit-note and voucher entries no longer collide on `UNIQUE(fy_id, entry_no)` (Invariant 8) |
| `0030_auth_bridge.sql` | **Platform/Auth:** `user_invitations` (admin-provisioned invites); `handle_new_auth_user()` AFTER INSERT trigger on `auth.users` keying `public.users.id = auth.uid()` (invited→active+roles, first user→bootstrap admin, unknown phone→`pending_review` zero-roles); `users.token_version` + status vocabulary; `admin_create_user()`, `admin_revoke_invitation()`, `assert_identity_integrity()` |
| `0031_access_overrides.sql` | **Platform/Access:** `user_permission_overrides` (per-user grant/deny + expiry, deny wins); `has_permission()` rewritten with precedence **suspended/disabled → override → admin → role**; `get_my_permissions()`, `bump_token_version()`, `admin_set_user_status()` (kill-switch, self-lockout guard), `grant/revoke_user_permission()`, `assign/unassign_role()`, `admin_create_role()`, `set_role_permission()`, `get_my_token_version()`. All admin RPCs gated by `roles.manage`, audited, bump token version |
| `0032_auth_token_hook.sql` | **Platform/Auth:** `custom_access_token_hook(event jsonb)` — Supabase Custom Access Token Hook injecting `app_metadata.{roles,perms,branch_id,user_status,token_version,is_admin}` on every token mint/refresh; `perms_for_user(uuid)`/`roles_for_user(uuid)` helpers (single precedence source, `get_my_permissions()` refactored to delegate). Never blocks login (returns event unchanged on error); claims are a UI/RLS cache only — DB re-checks in every RPC. Granted to `supabase_auth_admin`. *Enable in Auth settings — task 51.* |
| `0033_notification_prefs.sql` | **Platform/Notify:** `notification_preferences` (per-user, per-category mute of `whatsapp`/`sms`/`email`; `in_app` never muteable); `set_notification_preference()` (self-service); `notify()` extended to downgrade a muted external channel to `in_app`; `resolve_recipients(permission)` (active holders via `perms_for_user`, excludes suspended) + `notify_by_permission()` fan-out (gated: caller needs `roles.manage` or the target perm) |
| `0034_realtime_publication.sql` | **Platform/Realtime:** publishes `notifications`, `users`, `route_sessions`, `visits`, `sales_orders`, `invoices`, `complaints` to `supabase_realtime` (each verified RLS-enabled + SELECT policy first) with `REPLICA IDENTITY FULL`. High-churn value tables (`journal_lines`, `account_balances`) deliberately **not** published — read via RPC/read-models. Idempotent |
| `0035_perf_indexes.sql` | **Platform/Perf:** hot-path indexes (composite `(branch_id, date)` on orders/invoices, partial open-AR + unread-notifications, `stock_ledger(item,branch,time)`, access-control FK covers) — deliberate, not blanket. Materialized read-models `mv_trial_balance` (from cached `account_balances`, Inv 5) and `mv_ar_aging` (IST buckets, Inv 9), each with unique index for `CONCURRENTLY` refresh; `refresh_read_models()` + `get_trial_balance()`/`get_ar_aging()` reader RPCs, all gated by `report.view_all` (MVs have no RLS → never client-readable directly) |
| `0941_access_control_smoke.sql` | **Platform smoke (sentinel-rollback):** end-to-end proof of 0030–0035 — real `auth.users` insert fires the signup trigger (invite→active+roles+consumed; unknown phone→`pending_review`/0-roles; 2nd signup not auto-admin); `custom_access_token_hook` claims reflect roles/perms/overrides/suspension; precedence (deny>grant, expiry honored, grant adds); kill-switch + reactivate + self-lockout guard; notify mute-downgrade + gated broadcast; read-models gated; identity-integrity + audit intact. Ends `raise 'SMOKE_OK…'` → nothing persists |
| `seed/0100_seed_foundation.sql` | roles, permission matrix, company_settings, FY 2026-27 |
| `seed/0110_seed_chart_of_accounts.sql` | standard COA for the water business |
| `seed/0120_seed_catalog.sql` | sample units, SKUs, price lists, a customer + store |
| `tests/0900_smoke_post_journal.sql` | posts a balanced entry, asserts trial balance = 0 difference |
| `tests/0910_smoke_sales_cycle.sql` | opening stock → order → invoice → receipt; asserts WAC, GST, AR, trial balance |
| `tests/0920_smoke_purchase_cycle.sql` | GRN → supplier bill → payment; asserts WAC, Input GST, GRNI clears, AP, trial balance |
| `tests/0930_smoke_production_cycle.sql` | opening stock → 2 BOMs → stage-1 & stage-2 production runs → process costing; asserts WAC per stage, Production Clearing (1225) nets to 0, abnormal wastage to 5170, COGM/case, trial balance |
| `migrations/0940_phase4_smoke.sql` | Phase-4 all-paths (sentinel-rollback): scheme credit note reduces AR with GST split, commission run computes+posts, payroll computes+posts, bank recon difference resolves to 0, duplicate CSV import deduped, bounced cheque reverses; trial balance neutral throughout |

## Edge Functions

| Function | Contents |
|---|---|
| `functions/send-sms-hook/` | **Platform/Auth:** Supabase **Send SMS Auth Hook** (Deno). Auth invokes it instead of its built-in SMS sender for phone-OTP; it verifies the Standard-Webhooks hook secret (`SEND_SMS_HOOK_SECRET`), then POSTs the OTP to **httpSMS** (`x-api-key`, `{from,to,content}`) → paired Android gateway phone. Vendor isolated behind `provider.ts` (`SmsProvider`) for one-file swappability (plan §1.1a). Deploy `--no-verify-jwt` (it authenticates via the hook secret, not a user JWT). Secrets: `HTTPSMS_API_KEY`, `HTTPSMS_FROM`, `SEND_SMS_HOOK_SECRET`. See `functions/send-sms-hook/README.md`. *Enable the hook + phone auth in Auth settings — task 51.* |

## Web app (Next.js — task 52)

App Router on `@supabase/ssr`. **Auth is phone-OTP** (SMS via the Send SMS hook above); Google OAuth is offered as a secondary path. The DB (RLS + SECURITY DEFINER RPCs) is the only security boundary — JWT claims are a UI-speed cache, never trusted for authorization.

| Path | Contents |
|---|---|
| `src/lib/supabase/{client,server,middleware}.ts` | Browser (`createBrowserClient`), server (`createServerClient` + `next/headers`), and middleware session-refresh clients. Middleware uses `getUser()` (revalidates the token) and gates routes: signed-out → `/login`, not-`active` → `/pending`. |
| `src/lib/auth/claims.ts` | `AppClaims` shape + `readClaims()` (defensive parse of `app_metadata`), `can()` (UI-speed perm check mirroring `has_permission()`: status-active → admin-implies-all → perms), `isActive()`. |
| `src/lib/auth/session.ts` | Server-only `getSession()` (user + claims) and `getLiveTokenVersion()` (`get_my_token_version()` RPC). |
| `src/lib/auth/phone.ts` | E.164 normalization. **Critical:** Auth stores `phone` WITHOUT `+`; `signInWithOtp`/`verifyOtp` need it WITH `+`; invitation rows match WITHOUT `+`. |
| `src/app/login/` | Split-panel phone→OTP flow (`LoginFlow` client + `AuthBrandPanel`), `shouldCreateUser:false`, Google OAuth button. |
| `src/app/auth/{callback,signout}/route.ts` | OAuth code exchange; POST-only sign-out. |
| `src/app/pending/page.tsx` | Holding screen for non-`active` users (pending_review/suspended/disabled), keyed on `user_status`. |
| `src/components/auth/TokenVersionWatcher.tsx` | Claims-honesty (plan §2.5): compares cached `token_version` to live RPC on mount/focus/60s; on mismatch `refreshSession()` + reload. |
| `src/app/(app)/layout.tsx` | Protected group layout — `getSession()` gate (→`/login`/`/pending`), renders `AppShell`, mounts `TokenVersionWatcher`. |
| `src/components/shell/` | `AppShell` (58px/1fr/34px × 236px/1fr grid, mounts `ToastProvider` around the content), `Sidebar` (grouped nav, perm-gated via `can()`, cyan active state), `Topbar` (brand, ⌘K search, warehouse/FY selectors, bell, user menu + sign-out), `StatusBar`. `nav.ts` holds the grouped nav model with per-item `perm` codes. |
| `src/components/ui/` | Shared primitive library in the locked design system (barrel `index.ts`): `Button`, `Field`/`Input`/`Textarea`/`Select`/`LabeledInput`, `Card`/`Panel`/`SectionHeading`, `Badge`/`StatusBadge` (maps DB enums — `invoice_status`, `order_status`, `entry_status`, `license_status`, `notification_severity` — to tone colors), `Table` (`THead`/`TBody`/`TR`/`TH`/`TD`, mono-aligned numerics), `Skeleton`/`SkeletonText`/`SkeletonRows`, `EmptyState`, `Dialog`/`ConfirmDialog`, `Toast` (`ToastProvider` + `useToast`). |
| `src/lib/{format,cn}.ts` | `format.ts` — INR money (Indian grouping), `rupeesCompact` (lakh/crore), `qty`, `percent`, `dateIST`/`dateTimeIST` (Asia/Kolkata, Invariant 9), `titleCase`. `cn.ts` — classnames joiner. |
| `src/lib/data/` | Typed, **server-only, read-only** data-access layer (barrel `index.ts`) over the safe reader RPCs + read-models: `accounting.ts` (`getTrialBalance`, `getArAging` + `summariseArAging`), `notifications.ts` (`getRecentNotifications`, `getUnreadCount`), `licenses.ts` (`getLicensesDue` + `partitionLicenses`), `permissions.ts` (`getMyPermissions`, `getMyTokenVersion`), `fy.ts` (`getCurrentFy`, `todayIST`), `types.ts` (row aliases + `unwrap` resilient result helper). Reads run under the caller's JWT/RLS; every read degrades to a fallback instead of crashing the page. No mutations — those stay in SECURITY DEFINER RPCs (Invariant 3). |
| `src/app/(app)/page.tsx` | Dashboard — live widgets via the data layer: receivables-outstanding (AR aging), licence alerts (expired/expiring), recent activity (notifications), current FY. Sales-today and open-orders stay neutral placeholders until their module RPCs land. Reads run concurrently (`Promise.all`). |

Design system is the locked "light tactical operations console" (slate-on-white, single cyan-600 accent, Inter UI + JetBrains Mono numerals) — tokens in `tailwind.config.ts`, copied verbatim from the prototype.

```bash
cd app && npm install && npm run dev    # needs .env.local (see below)
```
`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE`, default `91`).

> **Dependency note:** `@supabase/ssr` (`^0.12.3`) and `@supabase/supabase-js` (`^2.110.7`) are pinned in lockstep — the newer typed `.rpc(fn, args)` overload (args inferred from the generated `Database` type) only resolves when `ssr` matches the installed `supabase-js`. An older `ssr` collapses RPC arg types to `never`. The clients use the modern `getAll`/`setAll` cookie interface required by `ssr` ≥ 0.6.

## How to apply

With the Supabase CLI (recommended):
```bash
supabase db reset            # applies migrations/ in order, then seed
# or apply a single file:
psql "$DATABASE_URL" -f supabase/migrations/0001_foundation.sql
```

Convention: **one concern per migration**, prefixed with a zero-padded sequence. Migrations are
append-only once merged — new changes get a new file, never edit a shipped migration.

## Conventions

- snake_case for all SQL identifiers; plural table names.
- Every money column is `numeric(14,2)`; every quantity is `numeric(14,3)`.
- Every table has `id uuid default gen_random_uuid() primary key`, `created_at timestamptz default now()`.
- Mutating tables also carry `created_by uuid` (→ users.id) and, where edited, `updated_at`.
- All amounts are in INR. No currency column in v1 (single currency).
- Enums are Postgres `create type … as enum`. Reference data that grows (accounts, roles) is tables, not enums.
- RPCs are `security definer` functions in schema `public`, prefixed by intent (`post_`, `next_`, `assert_`).

## Excluded from scope (by decision)

A1 returnable-jar/deposit tracking · A2 QC/lab testing · B5 quotation/proforma · C4 TDS/TCS.
Do not stub these in. See build plan §0.3 / §10.3.
