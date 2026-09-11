import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function BottomNav({
  tabs, active, onChange, badgeCounts = {},
}: {
  tabs: { id: string; label: string; icon: LucideIcon; center?: boolean }[];
  active: string;
  onChange: (id: string) => void;
  badgeCounts?: Record<string, number>;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingBottom: insets.bottom, height: 62 + insets.bottom }]}>
      <View style={s.row}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          const count = badgeCounts[tab.id] ?? 0;

          if (tab.center) {
            return (
              <Pressable key={tab.id} style={s.slot} onPress={() => onChange(tab.id)}>
                <View style={s.centerWrap}>
                  <View style={[s.centerCircle, t.shadow.fab]}>
                    <Icon size={22} color="#ffffff" />
                    {count > 0 ? (
                      <View style={s.badge}>
                        <Text style={s.badgeTxt}>{count > 99 ? "99+" : count}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text
                  style={[s.centerLabel, { color: t.color.brand, opacity: isActive ? 1 : 0 }]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable key={tab.id} style={s.slot} onPress={() => onChange(tab.id)}>
              {isActive ? <View style={s.pill} /> : null}
              <View style={s.iconWrap}>
                <Icon size={20} color={isActive ? t.color.brand : t.color.ink4} />
                {count > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{count > 99 ? "99+" : count}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[s.label, { color: isActive ? t.color.brand : t.color.ink4 }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  wrap: {
    backgroundColor: t.color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.color.line,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  pill: {
    position: "absolute",
    top: 0,
    width: 26,
    height: 2,
    borderRadius: 2,
    backgroundColor: t.color.brand,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: tokens.font.sansSemi,
    fontSize: 10,
    marginTop: 2,
  },
  centerWrap: {
    // Slot matches the regular icon row height so the label below lines up
    // with the other tab labels; the FAB itself lifts out via translateY.
    height: 28,
    alignItems: "center",
    justifyContent: "flex-end",
    transform: [{ translateY: -26 }],
    overflow: "visible",
  },
  centerCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    fontFamily: tokens.font.sansSemi,
    fontSize: 10,
    marginTop: 2,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: t.color.red,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: {
    color: "#ffffff",
    fontFamily: tokens.font.monoBold,
    fontSize: 9,
    lineHeight: 10,
    fontVariant: ["tabular-nums"],
  },
});
  }, [palette]);
};
