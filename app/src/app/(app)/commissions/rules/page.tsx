import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { listCommissionRules, listActiveUsers, listRoles } from "@/lib/data/commissions";
import { RulesSection } from "@/components/commissions/RulesSection";

export default async function RulesPage() {
  const session = await getSession();
  const claims = session?.claims ?? null;
  const canManage = claims ? can(claims, "accounting.manage") : false;

  const [rules, users, roles] = await Promise.all([
    listCommissionRules(),
    listActiveUsers(),
    listRoles(),
  ]);

  return <RulesSection rules={rules} users={users} roles={roles} canManage={canManage} />;
}
