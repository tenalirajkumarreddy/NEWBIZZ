# Users & Access Redesign — Implementation Plan

Date: 2026-08-11
Status: Draft
Spec: `docs/superpowers/specs/2026-08-11-users-access-redesign-design.md` (approved)

## Scope

Rewrite the `/admin/users` surface into three routes, add a per-user profile page
with operational data, and add a roles-management page. No DB changes — every
write reuses existing SECURITY DEFINER RPCs.

## Deviation from spec (deliberate)

The spec says actions return `ActionResult<T>`. The existing `actions/users.ts`
convention throws `Error(message)` on RPC failure and callers catch + toast. To
avoid a divergent half-migration, **all actions keep the throw-style convention**
(existing + new). UX outcome is identical (failures surface via `useToast`).
Noted here so the reviewer can veto if they want the ActionResult migration now.

## 1. Access model

- `src/lib/auth/route-guard.ts` — extend `RouteRule` with optional `roles?:
  string[]`. Add `/admin/users/roles` → `roles.manage` (placed BEFORE
  `/admin/users`). Change `/admin/users` → `roles: ["manager"]` (admin passes via
  `is_admin`). `canAccessPath` matches rule: `perm` → `can(claims, perm)`;
  `roles` → `claims.is_admin || claims.roles.some(r => roles.includes(r))`.
- `src/components/shell/nav.ts` — add `roles?: string[]` to `NavItem`; users item
  gets `roles: ["manager"]`.
- `src/components/shell/Sidebar.tsx` — filter items by `roles` before `perm`.
- App-shell layering already re-checks `canAccessPath` in `(app)/layout.tsx`.

Manager visibility rule everywhere: `isAdmin = claims.is_admin ||
claims.roles.includes("admin")`; `isManager = claims.is_admin ||
claims.roles.includes("manager")`. Use `isAdmin` to gate the access-control
section and the Roles link.

## 2. New UI primitives (`src/components/ui`)

- `Toggle.tsx` — `role="switch"`, `aria-checked`, keyboard togglable, brand fill
  when ON, disabled state. Props: `{ checked, onCheckedChange, disabled?, size? }`.
- `Tooltip.tsx` — ⓘ icon button; hover/focus shows a small floating label; native
  `title` fallback. Props: `{ text }`.
- Export both from `src/components/ui/index.ts`.

## 3. Permission grouping

- `src/lib/permission-groups.ts` (client-safe, no `server-only`):
  `PAGE_GROUP_LABELS: Record<string,string>` mapping dot-prefix → human label
  (e.g. `invoice` → "Sales & Invoicing"), plus `groupPermissions(perms:
  {code,description}[])` → `{ page, label, items }[]` ordered by a fixed page
  order then code. 36 codes → ~26 groups; unknown prefixes fall back to title
  case of the prefix.

## 4. Data layer

`src/lib/data/users.ts`:
- `UserRow` gains `branchName: string | null`. `listUsers` select adds
  `branch_id, branch:branches(name)`; map it.
- Add `getUser(id): Promise<UserRow | null>` — same shape (branch join WITHOUT
  `!inner` on user_roles so no-role users still resolve).
- `PermissionRow` / `RoleRow` / `UserOverride` / `InvitationRow` unchanged.

`src/lib/data/holdings.ts`, `src/lib/data/audit.ts` — unchanged (already accept
`userId` / `actorId`).

## 5. Server actions (`src/lib/actions/users.ts`)

Add (all throw-style, all `revalidatePath` both `/admin/users` and the profile
route `/admin/users/${userId}`):
- `setUserRole(userId, roleCode)` — `unassign_role` for every current role, then
  `assign_role` for the new one (single-role invariant, app layer).
- `approveUser(userId)` — `admin_set_user_status(p_user, 'active')` for
  `pending_review` users (RPC bumps token_version + audits).
- `createRoleAction(code, name, description?)` — `admin_create_role(code, name)`
  (upserts, so also serves rename). Keep rename as a distinct thin wrapper
  `renameRoleAction(code, name)` for intent clarity.
- `setRolePermissionAction(roleCode, code, scope)` — `set_role_permission(...,
  'all' | 'none')`.

Existing actions (`inviteUser`, `revokeInvitation`, `setUserStatus`,
`assignRole`, `unassignRole`, `grantPermission`, `revokePermission`) unchanged
but gain the profile-path `revalidatePath`.

## 6. List page (`/admin/users`)

- `page.tsx` — fetch `listUsers`, `listInvitations`, `listRoles`; read session
  claims; pass `isAdmin`.
- `UsersPage.tsx` (rewrite) — remove right-side master-detail. Layout:
  - Toolbar: tabs **All users · Pending · Suspended** (SettingsPage underline
    style or existing pill style), search box, "Roles & permissions" → `Link` to
    `/admin/users/roles` (admin only), "Invite user" → `InviteDrawer`.
  - Full-width `Table`: User (avatar + name + phone), Roles chips, `StatusBadge`,
    Member since (`dateIST`), chevron. Row is a `Link` to `/admin/users/[id]`
    (keep hover treatment via existing `TR interactive` styles / block link).
  - **Pending tab** merges `pending_review` users (Approve → `approveUser`) and
    invitations (Revoke → `revokeInvitation`); each row shows who + when; empty
    state when neither.
  - Search filters by name/phone (unchanged). Counts in tab labels.

## 7. Profile page (`/admin/users/[id]`)

- `[id]/page.tsx` — `getSession` → `isAdmin`; `Promise.all`:
  `getUser(id)`, `listPermissions()`, `listRoles()`, `listCashHoldings(id)`,
  `listStockHoldings(id)`, `listAuditPage({ actorId: id }, undefined, 8)`,
  `listUserOverrides(id)`. `notFound()` if no user. Pass everything + `isAdmin`
  to `UserProfilePage`.
- `[id]/UserProfilePage.tsx` — composes sections in spec order:
  - **ProfileHeader** — avatar, name, `StatusBadge`, role chip (single role;
    "No role" state), phone/email, branch, `dateIST(createdAt)` member-since,
    Suspend/Activate (`setUserStatus`, `ConfirmDialog` for suspend). Admin role
    shows the bypass note.
  - **HoldingsSummary** — two KPI cards: cash in custody (₹) and stock in
    custody (₹, sum of carryingValue).
  - **StockHoldingsTable** — item, SKU, qty, avg cost, value (`Table` + `Money`).
    Empty state when none.
  - **ActivityTimeline** — latest 8 `listAuditPage` rows: action chip
    (`AUDIT_ACTION_LABELS` tone map), summary, `dateTimeIST`/relative; "View all
    activity" → `/admin/audit?actor=<id>`.
  - **AccessControl** (admin only) — RoleSelector (dropdown of `listRoles`,
    "Change role…", calls `setUserRole`; disallow removing last role) +
    `PermissionToggleList`.
- `[id]/PermissionToggleList.tsx` (or shared, see §9) — groups permissions via
  `groupPermissions`; each row: `Tooltip` (description + source), label, toggle.
  Effective state per permission:
  - suspended user → all OFF.
  - admin role → all ON (rows disabled, bypass note).
  - deny override → OFF (source "Deny override").
  - grant override → ON (source "Override grant").
  - else role grants (`scope != 'none'`) → ON (source "Role · <name>"), else OFF.
  Toggle handler (Option A): flip OFF → if no deny override, `grantPermission`
  deny; flip ON → `revokePermission` (drop any override), and if the role does
  not grant it, `grantPermission` grant. Optimistic update + `router.refresh()`.

## 8. Roles page (`/admin/users/roles`)

- `roles/page.tsx` — admin-only: `redirect("/no-access")` when not `isAdmin`.
  Fetch `listRoles`, `listPermissions`, plus per-role user counts (derive from
  `listUsers()`). Pass to `RolesManagementPage`.
- `roles/RolesManagementPage.tsx` — two-pane:
  - Left: role list (name, user count); system roles badge; "+ New role" button;
    Rename menu per role (admin, viewer not deletable).
  - Right: `PermissionToggleList` for the selected role — toggle ON →
    `setRolePermissionAction(code, perm, 'all')`, OFF → `'none'`. Admin role rows
    rendered but disabled (bypass note). "Changes affect all users with this
    role; per-user overrides still win" hint.
  - New/Rename dialogs via existing `Dialog` + `Field`/`Input`.

## 9. Shared toggle list

Put the single `PermissionToggleList` at
`src/app/(app)/admin/users/PermissionToggleList.tsx`; imported by both the
profile `[id]` page and `roles/` page. Props:
`{ permissions, overrides?, roleName?, enabled, onToggle(code, on) }`. The
roles-page call drives it with `roleName = null` and `onToggle` mapping to
role-permission writes.

## 10. Audit actor filter (for "View all activity")

- `admin/audit/data/route.ts` — read `actor` query param → `actorId` in
  `listAuditPage`.
- `admin/audit/AuditLogPage.tsx` — accept `initialActor?: string`; initialise the
  actor filter state and include `actor` in the fetch params (mirror existing
  `action`/`entity` handling).
- `admin/audit/page.tsx` — `searchParams` → `initialActor`.

## 11. Cleanup

- Delete `src/app/(app)/admin/users/UserDetailPanel.tsx`.

## Verification

- `npm run typecheck` and `npm run build` in `app/`.
- Manual: admin sees list + profile + roles; manager sees list + profile (no
  access control, no Roles link, cannot open `/admin/users/roles` — redirected);
  pending approve/revoke; role change; toggle ON/OFF override semantics.
