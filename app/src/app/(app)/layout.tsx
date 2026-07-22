import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isActive } from "@/lib/auth/claims";
import { formatDisplay } from "@/lib/auth/phone";
import { AppShell } from "@/components/shell/AppShell";

// Protected group layout. Middleware already gates routing, but we re-check here
// (defence in depth + gives the server tree the session it needs). A signed-out
// user is bounced to /login; a signed-in-but-not-active user to /pending.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isActive(session.claims)) redirect("/pending");

  const { user, claims } = session;
  const displayName = deriveDisplayName(user, user.phone);
  const phone = user.phone ? formatDisplay(user.phone) : (user.email ?? "");
  const roleLabel = deriveRoleLabel(claims.roles, claims.is_admin);

  return (
    <AppShell
      claims={claims}
      displayName={displayName}
      phone={phone}
      roleLabel={roleLabel}
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
