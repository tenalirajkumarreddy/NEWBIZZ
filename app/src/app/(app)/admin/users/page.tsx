import { listUsers, listPermissions, listRoles } from "@/lib/data/users";
import { UsersPage } from "./UsersPage";

export const metadata = { title: "Users & Access — NEWBIZZ" };

export default async function Page() {
  const [users, permissions, roles] = await Promise.all([
    listUsers(),
    listPermissions(),
    listRoles(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Users &amp; Access</h1>
      <UsersPage users={users} permissions={permissions} roles={roles} />
    </div>
  );
}
