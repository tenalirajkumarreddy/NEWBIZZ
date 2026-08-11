# Users & Access Redesign — User Profile + Roles Management

Date: 2026-08-11
Status: Approved

## Problem

The current `/admin/users` page is a master–detail layout: rows on the left, a
380px detail panel on the right. It is cramped (rows don't fill the width),
hides per-user details behind the side panel, has no dedicated pending
workflow, gives no role-assignment or role-management UI, and shows no
operational data (holdings, activity) about a user.

The goal is a full-width list with a dedicated Pending tab, a dedicated per-user
profile page (details, holdings, activity, access control), and a roles
management page. Access control is admin-only; managers see operational data
and can suspend/activate users.

## Requirements

1. **List page (`/admin/users`)** — full-width table, no right-side panel.
   - Tabs: **All users · Pending · Suspended**.
   - Pending tab gathers both `pending_review` users (self-registered, no role)
     and pending invitations (sent, awaiting first login) with Approve/Revoke.
   - Rows: User (avatar + name + phone), Roles, Status, Member since, chevron.
   - Clicking a row navigates to `/admin/users/[id]`.
   - Search (name/phone) and "Invite user" stay; "Roles & permissions" button
     becomes a working link to `/admin/users/roles`.
2. **User profile page (`/admin/users/[id]`)** — everything about one user.
   - Section order: Header → Cash/Stock holdings → Stock detail → Latest
     activity → Permissions & access (admin only).
   - Header: avatar, name, status badge, single role chip, phone/email, branch,
     member-since, Suspend/Activate button.
   - Holdings: cash in custody (₹), stock in custody (₹) + per-item table
     (item, SKU, qty, avg cost, value).
   - Latest activity: audit log filtered to this user (action chips, summary,
     relative time), "View all activity" link.
   - Permissions & access (**admin only**, hidden for managers): single-role
     selector ("Change role…"), and every permission as a **toggle** grouped by
     page (dot-prefix namespace). Each toggle row has a ⓘ tooltip explaining
     exactly what the permission does and its source (role vs override).
3. **Role model** — a user has exactly **one** role at a time; the admin can
   change it (replaces the current role). Enforced in the app layer.
4. **Roles management page (`/admin/users/roles`)** — admin only.
   - Left: roles list with user counts. Right: selected role's permission
     toggles grouped by page (same toggle + ⓘ tooltip pattern).
   - "+ New role" (name + description), "Rename" per role. System roles
     (admin, viewer) cannot be deleted; admin always bypasses checks.
   - Changing a role's permissions affects all users holding that role;
     per-user overrides still win.
5. **Toggle semantics (locked: Option A)** — toggle reflects the user's
   effective access. ON = user has the permission (works for them). OFF = user
   does not have it. Flipping ON creates a **grant override**. If a role grants
   a permission and admin flips it OFF, a **deny override** is created so the
   toggle stays OFF. ⓘ tooltip explains the permission + source + expiry.
6. **Role-based visibility**:
   - **Admin**: everything, including Permissions & access and Suspend/Activate.
   - **Manager**: header, holdings, stock detail, activity, Suspend/Activate.
     No access control.
   - Route guard for `/admin/users`: allow admin OR manager.

## Architecture

### Routes

All under the existing route group `src/app/(app)/admin/users/`:

| Route | File | Access |
|---|---|---|
| `/admin/users` | `page.tsx` (rewrite) | admin or manager |
| `/admin/users/[id]` | `page.tsx` + `UserProfilePage.tsx` (new) | admin or manager |
| `/admin/users/roles` | `page.tsx` + `RolesManagementPage.tsx` (new) | admin only |

### Components

- **`UsersPage.tsx`** (rewrite) — tab state (`all | pending | suspended`),
  search, full-width `Table`; row is a `Link` to `[id]`; Pending tab shows
  `pending_review` users + invitations with Approve/Revoke.
- **`UserProfilePage.tsx`** (new) — composes the sections below. Receives the
  viewer's claims so it can render admin-only sections conditionally.
- **`ProfileHeader`** — avatar, name, status, role chip, contact, branch,
  member-since, Suspend/Activate (calls `setUserStatus`).
- **`HoldingsSummary`** — two KPI-style cards (cash ₹, stock ₹) fed by
  `listCashHoldings(userId)` / `listStockHoldings(userId)`.
- **`StockHoldingsTable`** — per-item rows (item, SKU, qty, avg cost, value).
- **`ActivityTimeline`** — `listAuditPage({ actorId: userId })`, action chips,
  summary, relative time; "View all activity" → `/admin/audit?actor=<id>`.
- **`AccessControl`** (admin only) — `RoleSelector` (single role +
  "Change role…" dropdown) and `PermissionToggleList`.
- **`PermissionToggleList`** (shared, also used on roles page) — groups
  permissions by their dot-prefix page; each row: ⓘ tooltip, name, description,
  `Toggle`. Props: `permissions`, `overrides`, `onToggle(code, on)`.
- **`RolesManagementPage.tsx`** (new) — role list sidebar + `PermissionToggleList`
  for the selected role; "New role" / "Rename" dialogs.
- **New UI primitives** in `src/components/ui`:
  - `Toggle` — accessible switch (`role="switch"`, `aria-checked`, keyboard
    toggle), brand color when ON.
  - `Tooltip` — ⓘ icon with hover/focus tooltip (`title` fallback).
  - `Tabs` — underline tab bar matching SettingsPage convention (or reuse the
    existing pattern).

### Data layer

- `src/lib/data/users.ts`:
  - Extend `listUsers` select to include `branch:branches(name)`.
  - Add `getUser(id)` → `{ ...user, roles, branch }` for the profile header.
- `src/lib/data/holdings.ts` — reuse `listCashHoldings(userId)`,
  `listStockHoldings(userId)` (already accept an optional userId).
- `src/lib/data/audit.ts` — reuse `listAuditPage({ actorId: userId })`.
- `src/lib/data/permissions.ts` — no change.

### Server actions (`src/lib/actions/users.ts`)

Existing: `inviteUser`, `revokeInvitation`, `setUserStatus`, `assignRole`,
`unassignRole`, `grantPermission`, `revokePermission`, `getUserOverridesAction`.

Add:
- `setUserRole(userId, roleCode)` — `unassign_role` for all current roles then
  `assign_role` for the new one (single-role invariant).
- `approveUser(userId)` — `admin_set_user_status(userId, 'active')` for
  `pending_review` users; bumps token version (handled by the RPC).
- `getProfileData(userId)` — server action returning `{ user, roles, cash,
  stock, activity, overrides, permissions, allRoles }` in one call (or compose
  from data functions on the server page).

All actions return `ActionResult<T>` (`{ok:true,data}` | `{ok:false,error}`),
call the existing SECURITY DEFINER RPCs (which already enforce `roles.manage`,
bump `token_version`, and write audit), and `revalidatePath` the profile page.

### Roles management actions

- New role: wrap `admin_create_role(code, name)`.
- Rename: `admin_create_role` upserts on code conflict (existing RPC), so
  rename = call it with the updated name.
- Toggle permission for a role: wrap `set_role_permission(roleCode, code,
  'all' | 'none')`.

## Data flow

1. Server page loads user + permissions + overrides + roles via data functions
   and passes them to the client component.
2. Toggling a permission calls `grantPermission` / `revokePermission`
   (user profile) or the role-permission action (roles page).
3. Changing role calls `setUserRole` (unassign + assign).
4. Approve/suspend call `setUserStatus` / `approveUser`.
5. All mutations bump `token_version`, forcing JWT claim refresh on the user's
   next request; UI revalidates and refetches.

## Role-based visibility & route guard

- `src/lib/auth/route-guard.ts`: `/admin/users` currently maps to
  `roles.manage`. Change so `/admin/users` is reachable when the caller is
  admin OR manager; `/admin/users/roles` stays `roles.manage`-gated.
- `UsersPage`/`UserProfilePage` receive the viewer's claims; render
  "Permissions & access" and the "Roles & permissions" button only when
  `isAdmin` (or has `roles.manage`).
- Manager still sees Suspend/Activate, holdings, stock, activity.

## Error handling

- All actions return `ActionResult`; failures surface via `useToast().error()`.
- Profile page sections are independently resilient: if holdings or activity
  fail to load, show an `EmptyState`/error note in that section, not the page.
- Tooltips, dialogs, and destructive actions (suspend) use existing
  `ConfirmDialog`/`Dialog` patterns.

## Testing

- `npm run typecheck` and `npm run build` must pass.
- Manual flows:
  - List: tabs filter correctly; Pending shows `pending_review` + invitations;
    row click navigates.
  - Profile (admin): all sections render; toggle ON grants, toggle OFF on a
    role-granted permission creates deny; role change replaces role.
  - Profile (manager): no access-control section; suspend/activate works.
  - Roles page (admin): toggle changes apply to role; new role/rename work;
    non-admin is blocked from the route.
- DB: all writes go through existing RPCs (no direct table writes).

## Out of scope

- No new DB tables or RPCs (single-role is enforced in the app layer).
- No change to the customer portal, WhatsApp, or other admin pages.
- No multi-role support (deliberate: one role per user).
