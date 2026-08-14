import { redirect } from "next/navigation";
import { listUsers, listRoles, listPermissions } from "@/lib/data/users";
import { getSession } from "@/lib/auth/session";
import { RolesManagementPage } from "./RolesManagementPage";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Roles & Permissions — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = session.claims.is_admin || session.claims.roles.includes("admin");
  if (!isAdmin) redirect("/no-access");

  const [users, roles, permissions] = await Promise.all([
    listUsers(),
    listRoles(),
    listPermissions(),
  ]);

  const userCounts = users.reduce<Record<string, number>>((acc, u) => {
    for (const r of u.roles) acc[r.code] = (acc[r.code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageContainer width="full">
      <PageHeader
        title="Roles &amp; Permissions"
        subtitle="Define who can do what. Changes apply to every user holding the role."
      />
      <RolesManagementPage
        roles={roles}
        permissions={permissions}
        userCounts={userCounts}
      />
    </PageContainer>
  );
}
