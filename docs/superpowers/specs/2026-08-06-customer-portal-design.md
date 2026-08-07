# Customer Portal — Design Spec

Date: 2026-08-06
Status: Proposed (awaiting confirmation)

## 1. Problem

Internal users (`public.users`, keyed to `auth.uid()`) have identity + phone
provisioned via invitations (migration 0030). Their app is `/(app)/**`, gated by
roles + permissions. **Customers are NOT users today** — they are `customers` rows
with a phone, and money/AR is keyed to `customer.id`; nobody logs in as a customer.

We want a **Customer Portal**: a customer logs in with the same phone-OTP / Google
auth and sees **only their own** invoices, balance/statement, documents, a
"pay intention" hint, and the ability to **create an order** against their stores.

## 2. Core decision — a separate portal principal

A customer must be a **logged-in principal** but must **not** inherit the internal
`users`/`roles`/`has_permission()` model. Mixing them would expose internal
navigation and internal permissions to a customer — a breach of the security model.

We introduce a first-class **portal principal**:

- `public.customer_portal` — one row per portal-able customer.
  - `customer_id uuid PK references customers(id)`
  - `status text ('inactive' | 'active' | 'suspended')` default `'inactive'` — an
    admin flips this on to allow login; toggling is instant.
  - `contact_phone text` — normalized E.164 **without** "+" (matches auth.users.phone).
  - `created_by` / `created_at` / `updated_at`
- The portal is **opt-in per customer** (admin enables it). No customer silently
  becomes a principal.

### Claim shape

The Custom Access Token Hook (0032) injects `app_metadata` claims. We add a
**portal marker** for portal principals:

- `app_metadata.portal_customer_id: uuid | null`
- Existing `roles = []` / `perms = []` stay empty for a portal principal, so
  `can()` / `has_permission()` remain false — they must not touch internal routes.

> Claims are a cache. The boundary is the DB: portal data is reached only through
> **SECURITY DEFINER RPCs that re-derive the caller's `portal_customer_id` from
> live tables**, never from the claim alone (same invariant as `has_permission()`).

## 3. Login flow (reuses existing OTP + Google)

The existing `LoginFlow` already handles phone→OTP and Google. For the portal we
need a **distinct entry route** so post-login routing knows where to send the
principal.

- New public route group `/portal/**` (own shell/layout, not `(app)`).
- `/portal/login` — a `PortalLoginFlow` component reusing the same OTP phone widget
  and Google button (from `LoginFlow`) but with `next` defaulting to `/portal`.

### How a phone maps to a portal principal

Same mechanism as internal invites: we look up `customer_portal.contact_phone`
(matching `auth.users.phone`, E.164 no "+"). The **Custom Access Token Hook**
resolves at token mint/refresh:
- if `auth.users.phone` matches an **active** `customer_portal.contact_phone`, set
  `portal_customer_id` in `app_metadata` (leave roles/perms empty).
- else keep claims as-is.

Because the phone is the identity key, **one phone → one principal role**: an auth
account is either internal (roles/perms) or portal (portal_customer_id), never
both. Warehouse staff who are also a customer use two numbers (or we disable their
portal). Deliberate simplification — confirmed with the user.

### Google login for portal
A customer can link a Google OAuth to the same portal row. When signing in via a
Google-created auth user whose phone is unset but whose email matches a
`customer_portal` approved email, the hook resolves `portal_customer_id` by email
fallback. (Optional; may be v2.)

## 4. Enabling a customer's portal (admin action)

- New admin surface: on the **customer** record (`/customers/[id]`) a "Portal
  access" section lets an admin enable/disable and assign `contact_phone`
  (defaults to `customer.phone`).
- `SECURITY DEFINER` RPC `admin_enable_customer_portal(customer_id, phone)`:
  - requires `customer.manage`
  - upserts `customer_portal` status = active, sets `contact_phone`
  - returns the contact_phone so the admin can share "log in at /portal".

## 5. Portal data scoping (the security boundary)

All portal reads travel through SECURITY DEFINER RPCs (no `anon`/`public` grants).
Each RPC calls helper `portal_customer_id()`:

```sql
create or replace function public.portal_customer_id() returns uuid
security definer set search_path = public as $$
  select cp.customer_id
    from customer_portal cp
    join auth.users a on a.phone = cp.contact_phone
   where a.id = auth.uid() and cp.status = 'active'
$$;
```

| RPC | Returns | Scope |
|---|---|---|
| `portal_my_profile()` | customer code/name/outstanding | customers where id = `portal_customer_id()` |
| `portal_my_invoices()` | invoices/orders for my customer + stores | status, due date, total |
| `portal_my_statement()` | receipt/challan/credit-note ledger rows for my customer | party-keyed query |
| `portal_my_documents()` | documents linked to my customer/stores | document_links scoped |
| `portal_submit_pay_intent(customer_id, amount, mode, reference)` | payment hint | definer, asserts `portal_customer_id()` = arg |
| `portal_create_order(store_id, lines)` | new order | definer, asserts `store.customer_id = portal_customer_id()` |
| `portal_catalog()` | items for order building (id, sku, name, price, qty) | read-only, no wholesale exposure |

Pattern: the definer function **ignores client-supplied customer_id for reads**
(uses `portal_customer_id()`); for writes it **asserts the argument equals
`portal_customer_id()`** so a customer cannot create orders / submit pay-intents
for anyone else. Mirrors the existing "definer-as-boundary" pattern.

## 6. Allowed actions only

The portal exposes **no ledger writes and no inventory writes** other than:

1. `portal_create_order` — creates a confirmed order (pure demand capture, no
   ledger/stock impact — matches `createOrder`, §4.4). Validates store belongs to
   `portal_customer_id()`, items exist, qty > 0, price override allowed. The
   business reviews/fulfils it in the main app (existing order→challan→invoice
   pipeline).
2. `portal_submit_pay_intent` — writes a **suggestion** row (customer_id, amount,
   mode cash/UPI/cheque, reference, created_at). This is a hint the customer made
   a payment; **unreconciled** until an internal user records the receipt in the
   main app. Staff see these on the Collections screen as "Payment intents".
   - `payment_intents` table: (`customer_id`, `amount`, `mode`, `reference`,
     `status pending|matched|void`, `matched_receipt_id`).

## 7. Routing / middleware

`lib/supabase/middleware.ts` gate gains a third path:

- `/portal` and `/portal/*` are reachable signed-out (login page).
- After login, a principal with `portal_customer_id` claim routes to `/portal`.
- A principal WITHOUT portal claims who opens `/portal/**` is bounced to the main
  app (or denied).

Each route under `/portal` additionally checks the definer RPC
`portal_customer_id() !== null` server-side in the layout, so a forged claim alone
can't open the portal. Access to internal `/(app)` stays blocked because a portal
principal has empty `perms`/`roles`.

## 8. UI surface

Structure mirrors `(app)` but with a **lean** portal shell (no internal sidebar):

```
app/src/app/portal/
  login/page.tsx          — OTP/Google (portal variant)
  layout.tsx              — shell (top bar, sign out, customer name/logo)
  page.tsx                — portal home: balance snapshot, recent invoices
  invoices/page.tsx       — invoice history + filters
  statement/page.tsx      — full statement
  pay/page.tsx            — submit pay intent + history
  orders/new/page.tsx     — create order (scoped to their stores)
  orders/page.tsx         — their orders list
```

## 9. Scope / sequence

1. **Migration** `0091_customer_portal.sql`:
   - `customer_portal` table + RLS (read-only; writes via RPC)
   - `portal_customer_id()` definer, granted to authenticated + service_role
   - definer RPCs: `admin_enable_customer_portal`, `portal_my_profile`,
     `portal_my_invoices`, `portal_my_statement`, `portal_my_documents`,
     `portal_catalog`, `portal_submit_pay_intent`, `portal_create_order`
   - `payment_intents` table + RPC + RLS
   - grants: NO anon/public on any new function; anon/PUBLIC revoked where
     applicable; FK index on `customer_portal.customer_id`
2. **Claims** — extend token hook + `Claims` to carry `portal_customer_id`.
3. **Data/action layer** — `lib/data/portal.ts`, `lib/actions/portal.ts`.
4. **Routes + shell** — `/portal` group.
5. **Admin enable** — customer page section.
6. Typecheck, build, smoke, commit.

## Decisions to confirm

1. Portal is per-customer (all their stores/invoices); `contact_phone` lives on
   `customer_portal`. OK?
2. A phone can only be **one** principal (internal OR portal), not both. OK?
3. Order from portal is **order-capture only**; internal staff fulfil/invoice it. OK?
4. Payment "intent" is a **pending suggestion** the staff reconciles (no auto
   ledger posting). OK?
5. Google for portal — include in v1 or defer?
