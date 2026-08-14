import { listUsers, listInvitations, listRoles } from "@/lib/data/users";
import { getSession } from "@/lib/auth/session";
import { UsersPage } from "./UsersPage";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Users & Access — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  const isAdmin = session
    ? session.claims.is_admin || session.claims.roles.includes("admin")
    : false;

  const [users, invitations, roles] = await Promise.all([
    listUsers(),
    listInvitations(),
    listRoles(),
  ]);

  return (
    <PageContainer width="full">
      <PageHeader title="Users &amp; Access" />
      <UsersPage users={users} invitations={invitations} roles={roles} isAdmin={isAdmin} />
    </PageContainer>
  );
}
