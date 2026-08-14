import type { ReactNode } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import type { BranchRow } from "@/lib/data/branches";
import type { FinancialYearRow } from "@/lib/data/types";
import type { FyRow } from "@/lib/data/settings";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { TokenVersionWatcher } from "@/components/auth/TokenVersionWatcher";
import { ToastProvider } from "@/components/ui";

// The frame every signed-in page renders inside. CSS grid (matches the locked
// refer_UI.html .app grid exactly):
//   rows:  60px topbar / 1fr body / 36px status bar
//   cols:  240px sidebar / 1fr content   (body row only)
// The shell is pinned to the viewport height with the outer scroll disabled, so
// the topbar and status bar stay static and ONLY the content cell (and the
// sidebar) scroll. `minmax(0,1fr)` lets the middle row shrink below its content
// so its own overflow engages instead of stretching the page.
export function AppShell({
  claims,
  displayName,
  phone,
  roleLabel,
  badges,
  warehouses,
  currentWarehouse,
  currentFy,
  financialYears,
  canManageSettings,
  children,
}: {
  claims: AppClaims;
  displayName: string;
  phone: string;
  roleLabel: string;
  badges?: Record<string, number | undefined>;
  warehouses: BranchRow[];
  currentWarehouse: BranchRow | null;
  currentFy: FinancialYearRow | null;
  financialYears: FyRow[];
  canManageSettings: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="grid h-[100dvh] overflow-hidden bg-bg"
      style={{
        gridTemplateColumns: "240px 1fr",
        gridTemplateRows: "60px minmax(0, 1fr) 28px",
      }}
    >
      {/* Keeps cached claims honest without trusting them for auth. */}
      <TokenVersionWatcher claimVersion={claims.token_version} />

      <div className="col-span-2">
        <Topbar
          displayName={displayName}
          phone={phone}
          roleLabel={roleLabel}
          warehouses={warehouses}
          currentWarehouse={currentWarehouse}
          currentFy={currentFy}
          financialYears={financialYears}
          canManageSettings={canManageSettings}
        />
      </div>

      <aside className="min-h-0">
        <Sidebar claims={claims} badges={badges} />
      </aside>

      <main className="min-h-0 overflow-y-auto">
        <ToastProvider>{children}</ToastProvider>
      </main>

      <div className="col-span-2">
        <StatusBar
          branchLabel={currentWarehouse ? `${currentWarehouse.name} · ${currentWarehouse.code}` : "No warehouse"}
          fyLabel={currentFy ? `FY ${currentFy.code}` : "FY —"}
        />
      </div>
    </div>
  );
}
