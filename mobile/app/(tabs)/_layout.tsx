import { useEffect, useRef, useState, type ComponentType, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { BottomNav } from "@/components/BottomNav";
import { useSession } from "@/lib/session";
import { onGotoTab } from "@/lib/tabBus";
import { tabsForRole, HOME_TAB } from "@/lib/tabs";
import DashOpScreen from "./dash-op";
import HomeScreen from "./home";
import RouteScreen from "./route";
import ScanScreen from "./scan";
import StoresScreen from "./stores";
import HistoryScreen from "./history";
import DashScreen from "./dash";
import ApprovalsScreen from "./approvals";
import CustomersScreen from "./customers";
import MoreScreen from "./more";
import OrdersScreen from "./orders";
import InventoryScreen from "./inventory";
import ProductionScreen from "./production";
import WorkersScreen from "./workers";
import { useMyCustody } from "@/data/transfers";
import { useJobCards } from "@/data/production";
import { useOrders } from "@/data/sales";
import { useTheme } from "@/theme/ThemeContext";

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

const OPERATOR_SCREENS: Record<string, ComponentType> = {
  "dash-op": DashOpScreen,
  orders: OrdersScreen,
  inventory: InventoryScreen,
  production: ProductionScreen,
  workers: WorkersScreen,
  history: HistoryScreen,
};

export default function TabsLayout() {
  const s = useStyles();
  const { user, claims } = useSession();
  const router = useRouter();
  const isOperator = claims.roles.includes("operator");
  const isAgent = claims.roles.includes("agent");
  const tabs = tabsForRole(claims.roles);
  const screens = isOperator ? OPERATOR_SCREENS : isAgent ? AGENT_SCREENS : MANAGER_SCREENS;
  const homeTab = isOperator ? HOME_TAB.operator : isAgent ? HOME_TAB.agent : HOME_TAB.manager;
  const [active, setActive] = useState<string>(homeTab);
  const pushingSell = useRef(false);

  const jobs = useJobCards(isOperator);
  const ord = useOrders(undefined, isOperator);
  const cust = useMyCustody(isOperator);
  const badgeCounts = useMemo<Record<string, number>>(() => {
    if (!isOperator) return {} as Record<string, number>;
    const openJobs = (jobs.data ?? []).filter((j) => j.status === "pending" || j.status === "in_progress").length;
    const approved = (ord.data ?? []).filter((o) => o.status === "approved").length;
    const pending = (cust.data ?? []).filter((c) => c.status === "pending" && c.to_user_id === user?.id).length;
    return { production: openJobs, orders: approved, history: pending };
  }, [isOperator, jobs.data, ord.data, cust.data, user?.id]);

  useEffect(() => {
    setActive(homeTab);
  }, [homeTab]);

  const Active = screens[active] ?? (active === "scan" ? ScanScreen : screens[tabs[0].id]);

  function openSell() {
    if (pushingSell.current) return;
    pushingSell.current = true;
    router.push("/record?mode=sale");
    setTimeout(() => {
      pushingSell.current = false;
    }, 600);
  }

  function onChange(id: string) {
    if (id === "sell") {
      openSell();
      return;
    }
    setActive(id);
  }

  useEffect(() => {
    return onGotoTab((id) => {
      if (id === "sell") {
        openSell();
        return;
      }
      setActive(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.root}>
      {Active ? <Active /> : null}
      <BottomNav
        tabs={tabs}
        active={active}
        onChange={onChange}
        badgeCounts={badgeCounts}
        compact={tabs.length >= 7}
      />
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
      root: { flex: 1, backgroundColor: t.color.bg },
    });
  }, [palette]);
};
