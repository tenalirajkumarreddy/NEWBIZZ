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

## 4. New database migrations (the only backend work)

### 4.1 `store_qr_codes` (mirror of reference app)
- Columns: `id uuid pk`, `store_id uuid → customer_stores (unique)`, `upi_id text unique`, `payee_name text`, `raw_data text`, timestamps.
- RLS: read for authenticated users; write via admin permission (`users_admin` / settings perms).
- RPC `resolve_store_by_upi(p_upi_id text)` → security definer returning the store row (joined customer/store_type/route names) the caller's RLS permits.

### 4.2 `handovers` (cash settlement between staff)
- Columns: `id`, `display_id`, `user_id (sender) → users`, `handed_to → users`, `cash_amount numeric ≥ 0`, `upi_amount numeric ≥ 0`, `status enum('awaiting_confirmation','confirmed','rejected','cancelled')`, `notes`, timestamps, `confirmed_by`, `cancelled_by`.
- Guard RPCs (all write `audit_log`):
  - `create_handover(p_handed_to, p_cash_amount, p_upi_amount, p_notes)` — rejects self/zero; checks sender holding balance (`staff_cash_holding()`) minus pending handovers; one pending per sender+recipient+day.
  - `confirm_handover(p_handover_id)` / `reject_handover` / `cancel_handover` — status transitions with role checks (recipient confirms/rejects; sender cancels own pending).
- RPC `staff_cash_holding(p_user_id)` — cash receipts recorded by user (from receipts/collect RPC data) minus confirmed+pending handovers.

### 4.3 QR registration UX
- Admin screen **in the APK (More → Store QRs)** and/or web later: list stores without QR, generate/register UPI id (manual entry of existing UPI id or generated placeholder `newbizz@store-{display_id}`), and render a printable QR (`react-native-qrcode-svg`) that the shop displays. Scan flow links `upi_id → store`.

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
