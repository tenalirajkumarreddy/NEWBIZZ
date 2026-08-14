"use client";

import { PageContainer, PageHeader, Panel } from "@/components/ui";
import { ProfileHeader } from "./ProfileHeader";
import { HoldingsSummary } from "./HoldingsSummary";
import { StockHoldingsTable } from "./StockHoldingsTable";
import { ActivityTimeline } from "./ActivityTimeline";
import { AccessControl } from "./AccessControl";
import type { UserRow, PermissionRow, RoleRow, UserOverride } from "@/lib/data/users";
import type { CashHoldingRow, StockHoldingRow } from "@/lib/data/holdings";
import type { AuditRow } from "@/lib/data/audit.types";

export function UserProfilePage({
  user,
  isAdmin,
  permissions,
  roles,
  overrides,
  cash,
  stock,
  activity,
}: {
  user: UserRow;
  isAdmin: boolean;
  permissions: PermissionRow[];
  roles: RoleRow[];
  overrides: UserOverride[];
  cash: CashHoldingRow[];
  stock: StockHoldingRow[];
  activity: AuditRow[];
}) {
  return (
    <PageContainer width="detail">
      <PageHeader
        backHref="/admin/users"
        backLabel="Back to users"
        title={user.fullName}
        subtitle="Profile, holdings, activity and access"
      />

      <ProfileHeader user={user} />

      <HoldingsSummary cash={cash} stock={stock} />

      <Panel title="Stock in custody" subtitle="Per-item detail of what this user holds">
        <div className="overflow-x-auto">
          <StockHoldingsTable stock={stock} />
        </div>
      </Panel>

      <Panel title="Latest activity" subtitle="Recent auditable actions by this user">
        <ActivityTimeline userId={user.id} rows={activity} />
      </Panel>

      {isAdmin && <AccessControl user={user} permissions={permissions} roles={roles} overrides={overrides} />}
    </PageContainer>
  );
}
