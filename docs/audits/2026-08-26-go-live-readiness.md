# Go-Live Readiness Audit — NEWBIZZ

**Date:** 2026-08-26
**Scope:** Full feature surface (128 app pages, 7 portal pages, 4 API routes, 100+ migrations), deployment/config, security posture, database health.
**Method:** Parallel code audits + live build (`tsc`, `next build`) + live-DB inspection (migrations, advisors, storage, config).

---

## Verdict: **CONDITIONAL GO**

The application itself is production-grade — zero type errors, green build, no placeholder screens, no dead imports, every nav route resolves, all money paths run through permission-checked SECURITY DEFINER RPCs behind three layers of route protection. What stands between you and launch is a short list of **ops/config actions and two small code fixes**, itemized below.

---

## 1. Blockers (must resolve before launch)

| # | Item | Type | Detail |
|---|---|---|---|
| **B1** | **Live API tokens committed to git** | SECURITY — worst finding | Repo root tracks `imaxx.intangles.com.har` + a copy, containing ~136 real `intangles-user-token` header values. Any push/publish ships them. **Rotate the Intangles token, delete both HARs, purge git history** (`git filter-repo` or BFG), then force-push. |
| **B2** | **Vercel environment variables unset/unknown state** | CONFIG | Required before first deploy: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (fails closed without it — webhook/crons/poller break), `CRON_SECRET`, `ENCRYPTION_KEY` (64-hex, for WhatsApp token storage), `META_APP_SECRET` (WhatsApp inbound fails closed without it), `INTANGLES_USER_TOKEN` + `INTANGLES_ACCOUNT_ID` (else `/api/intangles/poll` 500s every 5 min — or remove that cron entry), `NEXT_PUBLIC_APP_URL` (admin self-test otherwise targets `http://localhost:3000`). |
| **B3** | **Phone-OTP login is dead without Edge Function secrets** | CONFIG | `send-sms-hook` needs `supabase secrets set SEND_SMS_HOOK_SECRET HTTPSMS_API_KEY HTTPSMS_FROM` and the Send-SMS Auth hook enabled in Supabase Auth. Login *is* OTP here — this blocks all sign-in when done. |
| **B4** | **Cron guards fail OPEN when `CRON_SECRET` is unset** | CODE (small) | Pattern `if (expected && auth !== …)` in `api/cron/notifications/route.ts:11`, `api/cron/whatsapp/route.ts:10`, `api/intangles/poll/route.ts:7`. Unset secret ⇒ endpoints publicly invocable. Change to `if (!expected || auth !== …)` (fail closed) and set the secret. |
| **B5** | **Repo↔live migration drift** | CODE (small) | Live DB has applied migrations with **no file in `app/supabase/migrations/`** — notably `archive_notifications_rpc` (the Notifications Archive button calls this RPC; works live today but a rebuild from the repo alone regresses Notifications), plus the whole `whatsapp_*` series, portal `0091_*` series, `opening_stock_batch`, `holdings_transfers`, `job_cards_reversal`, `reconcile_payment_intents`, `index_remaining_fks`, `invitation_phone_*`, `secure_service_rpc`, `remove_remaining_anon_policies`, `google_orphan_cleanup*`. Minimum fix: capture `archive_notifications(p_ids uuid[])` from `pg_get_functiondef` into a new repo migration (same pattern as 0102 did for live-only RPCs). Full fix: export all live-only definitions. |
| **B6** | **Leaked-password protection disabled** | AUTH SETTING | Supabase Dashboard → Auth → Policies → enable HaveIBeenPwned check. One click. |
| **B7** | **`issued_numbers` has RLS but zero policies** | VERIFY | Currently deny-all via API. Confirm writes only flow through definer RPCs (likely yes — `next_number()`); if so, mark intentional or add an owner-only policy to silence the lint. |
| **B8** | **Drop-to-Attach human E2E never executed** | PROCESS | The 6-step browser checklist from the build session is still unchecked (＋ picker, drag on 3 pages, permission matrix, ₹500 receipt→Expense happy path, mobile viewport, non-file drag). Run it against staging/prod before announcing the feature. |

## 2. Should-fix (recommended at/near launch)

1. **Dead dashboard buttons** — `app/src/app/(app)/page.tsx:80-81`: "Export" and "Refresh" render but have no handlers. Wire Refresh to `router.refresh()` and either implement CSV export or hide Export.
2. **GPS double-polling** — `src/instrumentation.ts` boots an in-process poller in every warm Vercel lambda while `vercel.json` also crons `/api/intangles/poll` every 5 min. Gate `register()` off when `process.env.VERCEL` is set; drop unused `node-cron` dependency.
3. **`.env.example` gaps** — add `INTANGLES_USER_TOKEN/ACCOUNT_ID/POLL_INTERVAL_MS`, `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE`, `NEXT_PUBLIC_ALLOW_SELF_SIGNUP`, `NEXT_PUBLIC_APP_URL`, plus a block documenting the Edge-Function secrets (B3).
4. **CI** — add `npm run lint` job; consider a scheduled `supabase db reset && smoke` later.
5. **Security headers** — `next.config.js` has none; add HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY.
6. **`server-only` guards** — add `import "server-only"` to `lib/supabase/service.ts`, `lib/supabase/server.ts`, `lib/whatsapp/encryption.ts`, `lib/whatsapp/webhook-signature.ts` (prevents future accidental client-bundle import of secret-bearing modules).
7. **Spot-check `invitation_for_phone`** — one of only three anon-executable definer functions that *returns data*; confirm its response can't enumerate arbitrary phones.
8. **Docs staleness** — `app/README.md:165` still calls dashboard widgets placeholders (they're wired); duplicate migration numbers (`0048a/b`, `0049a/b`, `0050a/b`) noted for hygiene.

## 3. Database health

- **160 migrations applied live**, matching repo order where files exist (drift documented in B5).
- **Advisors (security):** 174 findings — **172 are the accepted pattern** here (definer RPCs executable by authenticated/anon but internally permission-gated — this is the app's core architecture). Real items: B6 and B7 only. No `search_path` mutable warnings, no MV issues.
- **Storage buckets:** `party-images` (public, intended), `documents` (private, 10 MB cap) — correct.
- **WhatsApp:** `whatsapp_config` has **no row** — Meta integration intentionally unconfigured (API approval pending). Value events enqueue `whatsapp`-channel notifications; worker skips sends safely; in-app notifications unaffected. Flip `dry_run=false` only after numbers/templates are live.
- **Self-notification fix (0109)** applied and verified earlier today.

## 4. Feature completeness matrix (condensed)

**READY (launch-grade):** Dashboard KPIs · Sales desk + cash memos + printable receipts · Orders (approve/cancel/version-lock/fulfil-as-sale) · Delivery challans · Collections (+ portal payment-intent reconciliation) · Customers/stores · Credit mgmt · Credit notes & schemes · Sales returns · Purchasing full chain (PO→GRN→Bill→Pay→Debit notes) · Suppliers/AVL · Catalog/pricing · Stock + opening batches + reorder alerts · Holdings/handover · BOM suite · EOD production runs + reversal · Process costing · Journal/vouchers/trial balance/reports · GST suite incl. GSTR-2B import+match · Expenses/petty cash · Assets/depreciation · Loans/EMI · Bank recon + cheque registry + credit cards · Documents vault + attach panels · Routes/visits/sessions · Fleet + live Intangles GPS · CRM suite · Targets/commissions · Payroll/attendance · Licenses + daily scans · Users/access admin (fine-grained perms) · Audit log · Release center · Production devices/hourly timeline · Settings (company/FY/branches/series/methods) · Customer portal (OTP login, orders, invoices, statement, UPI intent) · Global search · Tally XML export · Notifications (realtime bell, prefs) — *except Archive, see B5* · Drop-to-Attach *(pending human E2E, B8)*.

**PARTIAL (works, scope-simplified vs master plan):**
- Production planning §6.2 — not built; manual job board instead.
- Job cards §6.3 — board + device logs live; no shift-split/OEE reporting.
- FY rollover — create/close exist; automated closing-entry/opening-seed RPC absent.
- Opening-data migration §3.4 — manual paths only; no bulk CSV batches.
- Routes offline capture §7.1 — online-only.
- Portal payments — UPI-intent + back-office reconciliation; no gateway (Razorpay) integration.

**MISSING (by design, post-launch candidates):** Approval engine & budgets §5.10 · Machine maintenance §6.6 · WhatsApp Phases 3–5 (broadcasts, automation engine, AI) · WhatsApp Web-mode track (spec written, decisions parked) · i18n beyond English scaffold.

## 5. Ordered pre-launch checklist

1. Rotate Intangles token → delete HARs → purge history → force-push (B1)
2. Set all Vercel env vars (B2) + make cron guards fail-closed (B4 code change)
3. Set Edge Function secrets + enable SMS hook → test OTP login end-to-end (B3)
4. Enable leaked-password protection (B6)
5. Capture `archive_notifications` (minimum) into a repo migration (B5)
6. Verify `issued_numbers` deny-all is intentional (B7)
7. Fix the two dead dashboard buttons
8. Run the Drop-to-Attach browser checklist (B8)
9. Smoke test on the deployed URL: login → sale → receipt → collection → invoice PDF → journal tie-out → portal pay intent
10. Announce 🚀

---
*Generated 2026-08-26 · sources: parallel code audits, `tsc` + `next build` runs, live Supabase inspection (migrations/advisors/storage/config).*
