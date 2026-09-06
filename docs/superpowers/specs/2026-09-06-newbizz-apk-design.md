# NEWBIZZ Android APK (Expo) — Design Specification

**Date:** 2026-09-06
**Status:** Approved by user (chat approval)
**Related docs:** `DESIGN.md` (web design system), `app/README.md` (invariants, module map)

---

## 1. Goal

Ship a **native Android APK** of NEWBIZZ for daily operations staff (field agents + managers), with a **dedicated professional mobile UI** that reuses the Aqua-Prime-style mobile patterns (gradient header, frosted FAB nav, tinted-chip stat tiles, entity cards) rendered in NEWBIZZ's **cyan/slate theme**, keeping visual continuity with the web app.

Non-goals (v1): offline write queue, FCM push, iOS, Play Store listing, web admin parity.

---

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| APK scope | Core operations (daily ops set) |
| Approach | Native rebuild — dedicated UI, theme constant with web |
| Framework | **Expo / React Native + TypeScript** (expo-router) |
| Modules v1 | Home, Customers/Stores, Sales desk (Record Sale / Collect), Orders, Stock check, Scan (QR), Routes, History/Handovers, Manager dash + approvals |
| Auth | Phone OTP (same Supabase auth as web) |
| Users | Both role types: field agents AND managers (claims-driven) |
| Offline | Online-only v1 (graceful offline *states*, no write queue) |
| Distribution | Direct signed APK, sideload via WhatsApp/Drive |
| Architecture | **A — direct Supabase**: mobile calls the same Postgres RPCs the web uses; no BFF |
| Center tab | **QR Scan** (adds `store_qr_codes` table + registration) |

---

## 3. Architecture

```
mobile/                       # new Expo app at repo root
  app/                        # expo-router routes
    (auth)/login.tsx          # phone OTP
    (tabs)/                   # tab shells per role
    record.tsx                # modal stack: Record Sale / Collect Payment
    store/[id].tsx            # store profile
    notifications.tsx
    profile.tsx
  src/
    lib/                      # supabase client, rpc wrappers, formatters (moneyCompact, dateIST)
    theme/                    # tokens ported from DESIGN.md
    components/               # GradientHeader, BottomNav, StatTile, StoreCard, StatusBadge,
                              # EmptyState, Sheet, PullToRefresh, CreditBanner, ReceiptModal…
    features/
      home/  routes/  scan/  record/  stores/  history/  dash/  approvals/
  app.json  eas.json (skip)  android/ (prebuilt, committed)
```

- **Supabase JS v2**, `auth` session persisted in `expo-secure-store` / AsyncStorage.
- **tanstack-query** for data; RPC mutations invalidate targeted keys (mirror of web data layer discipline).
- All money/stock writes go through **existing security-definer RPCs**: `place_order()`, `post_invoice()`, `record_receipt()`, `next_number()`, and the new handover/QR RPCs below. RLS + `has_permission()` enforce authorization — the APK is just another trusted client.
- Role branching from custom access-token claims (`roles`, `perms`, `user_status`) — same claims as web.

## 4. Backend: zero new migrations (verified against live DB)

The Supabase project `wmpxwpubfxpexybqnynz` already exposes everything the APK needs:

| Capability | Existing surface (verified) |
|---|---|
| QR store lookup | `resolve_store_qr(p_code) → jsonb` (store, customer, outstanding, open challans, permission flags `can_sell/can_collect/can_visit/can_manage`) |
| QR registration | `link_store_qr(p_store_id, p_code, p_label) → uuid` (needs `customer.manage`) |
| Visits | `record_visit(p_store_id, p_lat, p_lng, p_visit_type, p_duration_min)` — auto-opens a route session if none active |
| Handovers | `transfers` table + `create_transfer(p_header, p_lines)` (`type:'cash'`, `from_user_id`, optional `to_user_id` or `deposit_account:'1120'`), `respond_transfer(p_id, p_accept)`, `cancel_transfer(p_id)` |
| Custody balance | `my_transfers_and_custody(p_from, p_to)` → rows incl. `cash_in_hand` |
| Money writes | `place_order(p_header, p_lines)`, `post_invoice(p_header, p_lines)` (credit-limit enforced internally via `check_credit_limit`), `post_invoice_from_order(p_order, p_lines, p_is_official, p_date)`, `record_receipt(p_header, p_allocations)` (header: `customer_id, amount, mode, deposit_account('2140' = agent custody), collected_by, store_id, notes`; modes `cash/upi/bank/cheque/card/adjustment`) |
| Reads | `search_customers(p_query, p_kind, p_status, p_limit)`, `store_outstanding(p_store)`, `customer_activity(p_customer, p_from, p_to, p_store)`, `customer_outstanding(p_customer)`, `get_ar_aging(p_branch)`, `resolve_price_list(p_store)` |
| Sessions/visits tables | `route_sessions` (status `pending/active/paused/completed/cancelled`, `agent_id`, `stores_planned/completed`), `visits` (visit_type `fulfill_order/collect_payment/record_sale/mark_visited`) |
| Notifications | `mark_notifications_read(p_ids)`, `archive_notifications(p_ids)`; `notifications` table w/ `status` unread/read |
| Permissions | `has_permission(p_code)` via claims; codes incl. `cashmemo.create, receipt.record, order.create, order.approve, order.cancel, field.routes, cash.transfer, stock.transfer, customer.manage` |

Receipts recorded by an agent go to `deposit_account '2140'` (user custody, `party_type=user`) — matching the handover model. `payment_methods` seed: `cash:user_cash`, `upi_agent:user_cash`, `upi_company:bank`, …

Sale flow money split: `post_invoice` books the full AR; the cash/UPI part collected on the spot is posted as an immediate `record_receipt` allocated to the new invoice (exact web parity, keeps Invariant 1/3 intact).

### 4.3 QR registration UX
- APK screen **More → Store QRs** (gated `customer.manage`): list stores, `link_store_qr()` with a generated code (e.g. `NB-{store_code}`), render printable QR (`react-native-qrcode-svg`). `resolve_store_qr` accepts either the raw code or a URL ending in `/s/{code}`.

## 5. Design system (theme tokens)

Ported from `DESIGN.md` — single source of truth:

| Token | Value |
|---|---|
| bg | `#f1f5f9` slate-100 |
| surface | `#ffffff` |
| line | `#e2e8f0` |
| ink / ink-2 / ink-3 / ink-4 | `#0f172a` / `#475569` / `#64748b` / `#94a3b8` |
| brand | `#0891b2` cyan-600 (hover `#0e7490`) |
| grn / amb / red | `#059669` / `#d97706` / `#dc2626` |

Patterns (from Aqua-Prime audit, recolored to cyan):
- **GradientHeader**: `cyan-600 → cyan-700 → cyan-900`, white content, safe-area padding, logo tile (`bg-white/15 ring-white/20`), role subtitle, **connectivity pill** (emerald tint online / red tint offline), notification bell w/ badge.
- **BottomNav**: frosted glass (`rgba(255,255,255,0.92)` + blur), 5 tabs, **raised center FAB-style scan button** (56px circle, brand color, border matching bg, glow shadow `rgba(8,145,178,0.4)`), active-pill indicator on top edge, `bg-brand/10` active tile, pulsing red badge for pending handovers/approvals.
- **StatTile**: `rounded-2xl` white card, 1px `line/60` border, soft shadow `0 1px 2px rgba(0,0,0,0.06)`, eyebrow label (11px semibold uppercase tracking), **JetBrains Mono tabular value**, delta line in grn/red, **tinted icon chip** (`bg-brand/10`, 28–44px, rounded-lg).
- **StoreCard**: left type-colored accent bar, avatar/thumb, name + mono display id, outstanding in red/green, 5-action icon row (Sale / Collect / Visit / Navigate / Call).
- **StatusBadge**: tinted pill `bg-{tone}/10 text-{tone} ring-{tone}/35`, never solid.
- **Cards lift on press**: `scale(0.97)` feedback, 150ms; screens fade-up 200ms; skeletons `animate-pulse`.
- Fonts: **Inter** (400/500/600/700) + **JetBrains Mono** (400/700) self-hosted TTFs via `expo-font`.
- Numbers: Indian grouping (`en-IN`), compact `₹1.84L/₹6.43Cr`; timestamps IST.
- Touch targets ≥ 44px; safe-area insets everywhere; no emojis in UI (inline SVG/icon set only — `lucide-react-native`).

## 6. Navigation

- **Agent tabs**: `Home · Routes · Scan(⦿) · Stores · History`
- **Manager tabs**: `Dash · Approvals · Sell(⦿) · Customers · More`
- Center tab or FAB opens **Record** (full-screen stack): segmented Record Sale / Collect Payment, store preselect-aware.
- Store profile = stack push (`store/[id]`), returns to originating tab.
- Auth gate: unauthenticated → `/login`; `user_status != active` → pending screen.

## 7. Screens (v1)

### Agent
1. **Home** — greeting gradient hero (time-based, name, role, date); Today revenue card (giant mono total + cash/UPI legend rows); MiniStat row (Sales / Cash / UPI); van-stock card (`user_stock_holdings` — products/units/value + per-product rows); Active Route card (progress bar, visited N/M, elapsed, End w/ summary dialog) or empty state; **Next Stop card** (nearest unvisited store: photo, address, due, actions Navigate/Call/Visit/Sale/Collect); pending orders list (top 5); quick actions (Catalog, Add Store).
2. **Routes** — route cards (name, store count, outstanding, active orders, visited pill); expand to store list w/ Mark Visit (GPS + reason dialog) / Sale / Collect / Navigate / Call; **session panel**: Start (GPS capture) / End (summary dialog); All Orders view: status chips (pending/confirmed/delivered/cancelled), order cards w/ Fulfill (loads items into Record) / Cancel (reason).
3. **Scan** — QR viewport (expo-camera, UPI deep-link parser `upi://pay?pa=…`); identified-store card (photo, badges, balance) with actions Record Sale / Collect / Mark Visit / Open Profile; **Nearby mode** (GPS → nearest 5 stores w/ distance); unknown-UPI amber state ("not linked — ask admin"); admin variant: link-UPI-to-store sheet.
4. **Record** (stack) — store picker sheet (search + route filter + **nearest-first GPS sort**); store balance card; product list (store-type catalog, unit price, qty steppers ±, line totals, price-override input where permitted); Add-other-product search; Order total card; **split Cash + UPI inputs**; new-balance summary card (old → this sale → new); credit-limit banners (exceeded blocks / >80% warns); submit → `post_invoice()` (or `place_order()` when order-flow) → **Receipt modal** (mono id, amounts, share/print).
   **Collect** variant: outstanding card, cash+UPI+notes, new-balance summary, `record_receipt()`.
5. **Stores** — search + route/type filter selects; StoreCard list w/ 5 actions; **FAB** → Add-store wizard (customer new/existing → store details → GPS capture + photo → review).
6. **Store Profile** (stack) — hero card w/ photo, badges, outstanding, Navigate/Call; quick actions; pricing list (effective price w/ source tag); **ledger** (merged sales+receipts reverse-chron, running balance old→new coloring).
7. **History** — Balance overview grid (Today sales / Today collections / Transferred today / **Net holding balance**); Submit-handover sheet (recipient select, amount, notes → `create_handover`); segmented views: **Activity** (day-grouped record cards, tap → drill-down w/ receipt; same-day edit/return where permission allows) · **Handovers** (sent/received cards w/ Confirm/Reject/Cancel) · **Expenses** (read-only list of the user's expense claims — the expenses module already exists on web).
8. **Notifications** (stack) — recent notifications w/ read state.
9. **Profile** (stack) — user, role, claims summary, sign out.

### Manager
1. **Dash** — gradient hero w/ today metric (sales total + delta); tile grid (Outstanding, Collections, Orders today, Active routes); Needs-approval card (pending orders / payment intents); weekly sales bar chart (skia or simple animated bars); top-due stores list.
2. **Approvals** — pending `sales_orders` + portal payment intents; approve/reject via existing RPCs; reason sheet for rejects.
3. **Customers** — same StoreCard list (all routes, no session needs).
4. **Sell(⦿)** — center opens Record modal (manager price-override allowed per claims).
5. **More** — notifications, store-QR admin, profile, links to web admin for deep modules, sign out.

## 8. Data flows & error handling

- Every screen = tanstack-query keys + RPC reads via a thin `src/lib/rpc.ts` typed wrapper; mutations invalidate related keys (e.g. after `post_invoice` invalidate store ledger, balances, today's stats).
- Errors: toast component w/ retry; friendly copy mapping for common RPC errors (`credit_limit_exceeded`, `insufficient_stock`, `concurrent_modification`-style cases per your RPCs).
- Credit-limit: exceeded → block (non-override roles), >80% → amber banner (source shown).
- GPS: optional-graceful; visit marking degrades to no-coords when denied (subject to RPC constraints).
- Connectivity: NetInfo listener → header pill; screens show cached query data w/ "showing cached" note where stale allowed (reads only; writes online-only).

## 9. Testing

- Unit: money formatters, UPI parser, credit-limit banner logic, cart/total math, holding-balance math.
- Component: render tests for StatTile, StoreCard, Record flow validation states (jest-expo + testing-library).
- E2E (manual script in repo): login → scan → record sale (cash+upi) → verify receipt + web-side ledger unchanged invariants; collect payment; handover create→confirm (two accounts).

## 10. Build & release

- `npx expo prebuild -p android` → committed `android/` with Gradle wrapper.
- Local signed release: generate keystore once (stored **outside** git; referenced via `gradle.properties` local), `gradlew assembleRelease` → `app-release.apk`.
- `versionCode`/`versionName` bump checklist; package id `com.newbizz.app`; NEWBIZZ icon/splash (cyan tile + N monogram).
- Build verification on device via `adb install`.

## 11. Out of scope (v1)

Offline write queue/idempotency keys, FCM push, iOS, Play Store, WhatsApp module UI, production/costing/purchasing/fleet/payroll UIs (remain web-only).
