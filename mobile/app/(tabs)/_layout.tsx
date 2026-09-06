import { useEffect, useState, type ComponentType } from "react";
import { View, StyleSheet } from "react-native";
import Toast from "react-native-toast-message";
import {
  Home, Map, ScanLine, Users, History, LayoutDashboard, ClipboardCheck, Plus, Menu,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { BottomNav } from "@/components/BottomNav";
import { useSession } from "@/lib/session";
import { onGotoTab } from "@/lib/tabBus";
import { tokens } from "@/theme/tokens";

import HomeScreen from "./home";
import RouteScreen from "./route";
import ScanScreen from "./scan";
import StoresScreen from "./stores";
import HistoryScreen from "./history";
import DashScreen from "./dash";
import ApprovalsScreen from "./approvals";
import CustomersScreen from "./customers";
import MoreScreen from "./more";

interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
}

const AGENT_TABS: TabDef[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "routes", label: "Routes", icon: Map },
  { id: "scan", label: "Scan", icon: ScanLine, center: true },
  { id: "stores", label: "Stores", icon: Users },
  { id: "history", label: "History", icon: History },
];

const MANAGER_TABS: TabDef[] = [
  { id: "dash", label: "Dash", icon: LayoutDashboard },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck },
  { id: "sell", label: "Sell", icon: Plus, center: true },
  { id: "customers", label: "Customers", icon: Users },
  { id: "more", label: "More", icon: Menu },
];

const AGENT_SCREENS: Record<string, ComponentType> = {
  home: HomeScreen,
  routes: RouteScreen,
  scan: ScanScreen,
  stores: StoresScreen,
  history: HistoryScreen,
};

const MANAGER_SCREENS: Record<string, ComponentType> = {
  dash: DashScreen,
  approvals: ApprovalsScreen,
  customers: CustomersScreen,
  more: MoreScreen,
};

export default function TabsLayout() {
  const { claims } = useSession();
  const isAgent = claims.roles.includes("agent");
  const tabs = isAgent ? AGENT_TABS : MANAGER_TABS;
  const screens = isAgent ? AGENT_SCREENS : MANAGER_SCREENS;
  const [active, setActive] = useState(isAgent ? "home" : "dash");

  useEffect(() => {
    setActive(isAgent ? "home" : "dash");
  }, [isAgent]);

  const Active = screens[active] ?? screens[tabs[0].id];

  function onChange(id: string) {
    if (id === "sell") {
      Toast.show({ type: "info", text1: "Coming soon" });
      return;
    }
    setActive(id);
  }

  useEffect(() => {
    return onGotoTab((id) => {
      if (id === "sell") {
        Toast.show({ type: "info", text1: "Coming soon" });
        return;
      }
      setActive(id);
    });
  }, []);

  return (
    <View style={s.root}>
      {Active ? <Active /> : null}
      <BottomNav tabs={tabs} active={active} onChange={onChange} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
});
