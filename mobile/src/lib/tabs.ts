import {
  Home, Map, ScanLine, Users, History, LayoutDashboard, ClipboardCheck, Plus, Menu,
  Store, Boxes, Factory,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
}

export const AGENT_TABS: TabDef[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "routes", label: "Routes", icon: Map },
  { id: "scan", label: "Scan", icon: ScanLine, center: true },
  { id: "stores", label: "Stores", icon: Users },
  { id: "history", label: "History", icon: History },
];

export const MANAGER_TABS: TabDef[] = [
  { id: "dash", label: "Dash", icon: LayoutDashboard },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck },
  { id: "sell", label: "Sell", icon: Plus, center: true },
  { id: "customers", label: "Customers", icon: Users },
  { id: "more", label: "More", icon: Menu },
];

export const OPERATOR_TABS: TabDef[] = [
  { id: "dash-op", label: "Dash", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: Store },
  { id: "inventory", label: "Stock", icon: Boxes },
  { id: "scan", label: "Scan", icon: ScanLine, center: true },
  { id: "production", label: "Jobs", icon: Factory },
  { id: "workers", label: "Workers", icon: Users },
  { id: "history", label: "History", icon: History },
];

export function tabsForRole(roles: string[]): TabDef[] {
  if (roles.includes("operator")) return OPERATOR_TABS;
  if (roles.includes("agent")) return AGENT_TABS;
  return MANAGER_TABS;
}

export const HOME_TAB = { operator: "dash-op", agent: "home", manager: "dash" } as const;
