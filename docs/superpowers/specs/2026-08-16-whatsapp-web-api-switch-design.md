# WhatsApp Web + API Channel Design (exploration notes)

**Date:** 2026-08-16
**Status:** Exploration / parked for later — design not yet validated
**Owner:** NEWBIZZ platform
**Reference:** `2026-08-02-whatsapp-phase1-design.md` (current Phase-1 WhatsApp: official Meta Business Cloud API); migrations 0078/0080–0086, 0106; `src/lib/whatsapp/*`, `src/lib/actions/whatsapp.ts`, `src/lib/data/whatsapp.ts`, `/api/webhooks/whatsapp`, `/api/cron/whatsapp`, `/whatsapp` inbox, `/admin/whatsapp` settings.

## 1. Purpose

Explore adding a **second WhatsApp transport — "web mode"** (QR-paired automation on a personal number) alongside the existing **API mode** (Meta Business Cloud API), with the ability to **switch between them**, and an **auto / manual** send decision per notification.

Goal stated by user: notify customers when a sale is recorded, a collection/transaction is recorded, a balance changes, or an order is created — i.e. **any action that changes the customer store's ledger** — so there is never a discrepancy between the ledger and the messages we send. Track whether the message was **delivered**. Support both automatic dispatch and a manual "tap the bell" flow.

## 2. Current state (what exists today)

- **Transport:** Meta Business Cloud API only, hard-coded (`src/lib/whatsapp/meta-api.ts`, Graph v21.0). No provider abstraction seam (unlike SMS `send-sms-hook/provider.ts` which switches on `SMS_PROVIDER`).
- **Tables:** `whatsapp_config` (singleton, encrypted token), `whatsapp_conversations` (per E.164 phone, linked to `customer_stores`/`customers`), `whatsapp_messages` (direction, type, body, media, template, `whatsapp_message_id`, `status` sent/delivered/read/failed, `sent_by`).
- **Dispatch:** `notifications.delivery_channel='whatsapp'` rows are drained by `src/lib/whatsapp/worker.ts` via Vercel cron `/api/cron/whatsapp`; respects per-category user mute (`whatsapp_pref_allows`); in-app notification always written regardless of WhatsApp outcome.
- **Inbound:** `/api/webhooks/whatsapp` verifies X-Hub-Signature-256, ingests messages + status callbacks → `whatsapp_insert_message` / `whatsapp_update_message_status`.
- **UI:** `/whatsapp` agent inbox (two-pane, text or template composer, mark-read, sidebar unread badge); `/admin/whatsapp` settings + test panel + templates.
- **Config flag:** `whatsapp_config.dry_run` gates real Meta calls (default true → dry-run).

## 3. Target flow (user-specified)

```
<action triggered>            (any action that changes the customer store's ledger — sale,
                               collection, balance update, order created)
  <receipt generated?>        (only if the action has one — see §4)
  <message formatted>
  <check mode: API or WEB>
  <check mode: auto or manual>
     if AUTO:
        if API   -> send directly to the customer via API
        else WEB -> send to the customer by searching the number and sending  [feasibility?—see §7]
     else MANUAL:
        if API   -> when the user clicks the notification/action button, send via API
        else WEB -> when clicked, open the integrated WhatsApp (web) window for that
                    customer, stage the formatted message, wait for the user to hit send
  delivery/status tracked (delivered or not)
```

Key invariant: **every ledger-affecting action has a candidate WhatsApp message**, so the ledger and the messages never drift. Manual mode always yields to a human before anything is sent.

## 4. Receipts / documents — clarified data model

"Receipt" is overloaded. There are **3 document kinds on 2 tables**:

| Customer document | Table + discriminator | Series | Trigger |
|---|---|---|---|
| GST Tax Invoice | `invoices` `is_official=true` | `SL{fy}{nnnn}` | `post_invoice()` |
| Cash Memo (unofficial sale) | `invoices` `is_official=false` | `CM{nnnn}` | `post_invoice()` |
| Collection Receipt | `customer_receipts` | `PT{fy}{nnnn}` | `record_receipt()` |

- A **sale** does NOT create a `customer_receipts` row — the **invoice (or cash memo) is the sale's customer-facing receipt**. Invoices carry GST (CGST/SGST/IGST/cess) and `grand_total`; cash memos are tax-zeroed.
- A **collection** DOES create a `customer_receipts` row — that **is** the receipt document (amount, mode, reference, deposit account), allocated to invoices via `receipt_allocations`, down-paying `invoices.amount_paid`.
- **Order created** → `sales_orders` (no receipt) — only an order number to message about.
- **Balance update** → `customer_ledger` read-model (running `balance_after`) — no standalone doc; message would quote the balance.
- Credit notes (`credit_notes`) reduce AR but are never cash-out; not currently in the notify scope.

Consequence for message formatting: each action maps to exactly one document (invoice/cash-memo/receipt) or to a ledger balance; the formatted message must cite the same numbers the ledger shows.

## 5. Proposed architecture direction (NOT yet validated — parked)

- Introduce a **provider seam** instead of the hard-coded Meta client. Suggested minimal surface: `whatsapp_config.provider enum ('meta'|'web')` + a small transport interface; keep `whatsapp_messages`/`whatsapp_conversations`/`notifications` unchanged so both modes write through the same RPC/data layer.
- **API mode** = today's Meta path (exists).
- **Web mode** = an automation gateway (whatsapp-web.js or Baileys) that:
  - pairs via **QR** shown in `/admin/whatsapp`,
  - persists the session/creds (encrypted, like the Meta token),
  - exposes send-by-phone-number (search + send) and receive → same `whatsapp_insert_message` path,
  - reports delivery status where the protocol exposes it.
- **Auto/manual** decision stored on the notification/event (or a per-event config) so a human can always override.
- Manual mode is a UI concern layered on the existing inbox (see open question below).

## 6. Risks / tradeoffs (must be acknowledged before proceeding)

- **ToS / ban risk:** web automation (whatsapp-web.js / Baileys) runs on a **personal** WhatsApp number and violates WhatsApp Terms (unofficial client). Real ban/reset risk, especially at volume. API mode is the compliant path.
- **Number conflict:** a number can only be one of (business-API) or (personal/web) at a time — web mode cannot use the same number the WABA API uses.
- **Reliability:** QR session expiry, re-pair, disconnects; delivery/read reporting is weaker on the unofficial protocol.
- **Security:** pairing state + credentials must be encrypted at rest like the Meta token; never expose the session to anon/authenticated roles.
- **Shipping/locality:** web automation gateway must run somewhere with outbound internet (Vercel function runtime may be unsuitable for a long-lived WhatsApp session; likely needs a small always-on Node service).

## 7. Open questions (deferred — answered later, not now)

1. **Web-mode UX:** how should "open the customer + stage the message" work?
   - (a) Existing `/whatsapp` inbox drives the web channel; manual mode opens the customer's thread with the message staged in the composer (user presses send in-app). Recommended.
   - (b) Drive a real WhatsApp Web window/tab (auto-navigate to the customer's chat, pre-type, user presses send there). Uses genuine Meta UI, leaves the app.
   - (c) Both.
2. **Feasibility of "search number + send" in web mode:** needs confirmation against the chosen gateway library (Baileys can open a chat by JID and send; whatsapp-web.js can too). Most cost available for the plan phase.
3. **Where the web gateway runs** (always-on service vs serverless).
4. **Auto/manual default** per event category, and how the manual bell surfaces on sales/collection screens.
5. Whether **status callbacks from web mode** can drive `notifications.sent_external`/`sent_at` and the delivered/read badge equally with API mode.

## 8. Next steps (when we resume)

1. Confirm decisions in §7 (especially web-mode UX and where the gateway runs).
2. Write a validated design + shift to an implementation plan (existing repo convention: `docs/superpowers/specs/…-design.md` then `docs/superpowers/plans/…`).
3. Keep migrations additive; do not modify existing Meta path until the seam is proven.

## 9. Acceptance criteria (for later, once designed)

1. Provider switch (meta ⇄ web) is a config flip — no code changes per mode.
2. Every ledger-affecting action (sale, collection, balance, order) can enqueue a formatted notification in either mode.
3. Delivery status is visible per message in both modes.
4. Manual mode never sends without an explicit human confirm.
5. In-app notification always exists regardless of mode/outcome.