# Role-Specific Holdings & Handover UI

**Date:** 2026-07-23
**Status:** Approved

## Problem

The Holdings & Handover page (`/holdings`) currently shows all data and all transfer modes
to every active user. The DB enforces `stock.transfer` and `cash.transfer` at the RPC
level, but the UI gives no hint about what a user can or cannot do. This creates confusion
(users see buttons that always fail) and exposes data field users shouldn't need.

## Guiding Principle

The UI should match the user's mental model of their role. An agent cares about their own
stock and cash, not the warehouse operator's holdings. A sales person should never see a
Stock handover mode they can't use. Admin/manager get the full command-centre view.

## Design

### Page-level gating

The nav item keeps **no `perm`** — all internal staff see the page. Customers are on a
separate portal and never reach it.

### Data scoping (`lib/data/holdings.ts`)

| Data function | Admin/Manager | Operator | Agent | Sales | Marketer |
|---|---|---|---|---|---|
| `listCashHoldings` | All users | All users | All users | All users | All users |
| `listStockHoldings` | All users | All users | Own only | Own only | — (none) |
| `listTransfers` | All | Involved only | Involved only | Involved only | Involved only |

- **Involved** = `from_user_id = me OR to_user_id = me OR from_branch_id IN (my_warehouses) OR to_branch_id IN (my_warehouses)`. For simplicity: `from_user_id = me OR to_user_id = me` is sufficient for agents/sales/marketer. Operators additionally include warehouse transfers.

- **Cash holdings** are visible to everyone (transparency builds trust — field users see
  who holds what cash up the chain). Stock holdings are scoped because stock is
  inventory-physical and privacy matters for item-level data.

### New Handover Panel (`NewTransferPanel.tsx`)

| Mode | Admin/Manager | Operator | Agent | Sales | Marketer |
|---|---|---|---|---|---|
| Stock — WH→user | ✓ | ✓ | ✗ | ✗ | ✗ |
| Stock — Self→user | ✓ | ✗ | ✓ | ✗ | ✗ |
| Stock — Self→warehouse | ✓ | ✗ | ✓ | ✗ | ✗ |
| Cash → another user | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cash → bank deposit | ✓ | ✓ | ✓ | ✓ | ✓ |

Logic: pass `claims` to the component. Based on role+perms:
- Has `stock.transfer`? → show Stock mode buttons, but restrict origin/dest options
- `stock.transfer` scope = `WH↔users`? → only warehouse→user origin
- `stock.transfer` scope = `anyone`? → only self→user/warehouse origin (agent has stock
  holdings; sales/marketer don't)
- Has no `stock.transfer`? → hide Stock mode entirely
- Has `cash.transfer`? → show Cash + Deposit modes (everyone except customer)

### Cash/Stock in Custody tables

Rendered on the server page (`page.tsx`):
- **Admin/manager**: both tables show ALL rows (current behaviour).
- **Others**: `filter(r => r.userId === myUserId)` — only their own row(s).

### Transfer list (`TransferList.tsx`)

- **Admin/manager**: full list (no filter).
- **Others**: only transfers where they are sender or receiver.

## Implementation plan

1. **`lib/data/holdings.ts`** — add `userId` optional filter params to
   `listTransfers()`, `listCashHoldings()` (already returns signed-in user's data via
   `getMyHoldings()`), `listStockHoldings()`.

2. **`holdings/page.tsx`** — pass `claims` to determine filter params. Filter custody
   tables on the server before passing to render.

3. **`NewTransferPanel.tsx`** — accept `claims` prop. Gate mode options and Stock
   origin/dest based on `can(claims, 'stock.transfer')` and scope inference from role
   code in claims.

4. **`TransferList.tsx`** — accept `claims` prop. Show all to admin/manager; show
   filtered list to others.

5. **Nav** — no change (no `perm` on holdings item).
