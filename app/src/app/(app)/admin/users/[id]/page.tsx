import { notFound } from "next/navigation";
import { getUser, listPermissions, listRoles, listUserOverrides } from "@/lib/data/users";
import { listCashHoldings, listStockHoldings } from "@/lib/data/holdings";
import { listAuditPage } from "@/lib/data/audit";
import { getSession } from "@/lib/auth/session";
import { UserProfilePage } from "./UserProfilePage";

export const metadata = { title: "User — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function UserProfileRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const isAdmin = session
    ? session.claims.is_admin || session.claims.roles.includes("admin")
    : false;

  const [user, permissions, roles, overrides, cash, stock, activity] = await Promise.all([
    getUser(id),
    listPermissions(),
    listRoles(),
    listUserOverrides(id),
    listCashHoldings(id),
    listStockHoldings(id),
    listAuditPage({ actorId: id }, undefined, 8),
  ]);

  if (!user) notFound();

  return (
    <UserProfilePage
      user={user}
      isAdmin={isAdmin}
      permissions={permissions}
      roles={roles}
      overrides={overrides}
      cash={cash}
      stock={stock}
      activity={activity.rows}
    />
  );
}
