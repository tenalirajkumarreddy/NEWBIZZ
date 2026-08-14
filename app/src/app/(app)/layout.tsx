import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { can, isActive } from "@/lib/auth/claims";
import { canAccessPath, NO_ACCESS_PATH } from "@/lib/auth/route-guard";
import { formatDisplay } from "@/lib/auth/phone";
import { getNavBadges } from "@/lib/data/badges";
import { listWarehouses } from "@/lib/data/branches";
import { getCurrentFy } from "@/lib/data/fy";
import { listFinancialYears } from "@/lib/data/settings";
import { AppShell } from "@/components/shell/AppShell";

// Protected group layout. Middleware already gates routing + per-route
// permission, but we re-check here (defence in depth + gives the server tree
// the session it needs). A signed-out user is bounced to /login; a
// signed-in-but-not-active user to /pending; an active user reaching a route
// their roles can't open to /no-access.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isActive(session.claims)) redirect("/pending");

  const pathname = (await headers()).get("x-pathname") ?? "/";
  if (!canAccessPath(session.claims, pathname)) redirect(NO_ACCESS_PATH);

  const { user, claims } = session;
  const displayName = deriveDisplayName(user, user.phone);
  const phone = user.phone ? formatDisplay(user.phone) : (user.email ?? "");
  const roleLabel = deriveRoleLabel(claims.roles, claims.is_admin);
  const [badges, warehouses, currentFy, financialYears] = await Promise.all([
    getNavBadges(claims),
    listWarehouses(),
    getCurrentFy(),
    listFinancialYears(),
  ]);

  // The claim only carries branch_id for users assigned to a branch. When it's
  // null (no assignment) or stale (branch removed), fall back to the first
  // active warehouse so the topbar/status bar still show a real context.
  const currentWarehouse =
    warehouses.find((w) => w.id === claims.branch_id) ?? warehouses[0] ?? null;

  return (
    <AppShell
      claims={claims}
      displayName={displayName}
      phone={phone}
      roleLabel={roleLabel}
      badges={badges}
      warehouses={warehouses}
      currentWarehouse={currentWarehouse}
      currentFy={currentFy}
      financialYears={financialYears}
      canManageSettings={can(claims, "settings.manage")}
    >
      {children}
    </AppShell>
  );
}

function deriveDisplayName(
  user: { user_metadata?: Record<string, unknown> },
  phone: string | undefined,
): string {
  const m = user.user_metadata ?? {};
  const name =
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    "";
  if (name) return name;
  return phone ? formatDisplay(phone) : "User";
}

// Turn role codes into a compact human label ("Admin", or "Sales · Accounts").
function deriveRoleLabel(roles: string[], isAdmin: boolean): string {
  if (isAdmin) return "Administrator";
  if (roles.length === 0) return "No role";
  return roles.map(titleCase).join(" · ");
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
