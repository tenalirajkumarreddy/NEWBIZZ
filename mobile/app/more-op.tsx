import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Switch } from "react-native";
import { useSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useIsFetching } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { EmptyState } from "@/components/EmptyState";
import { tokens } from "@/theme/tokens";
import { useRouter } from "expo-router";
import { moon, sun } from "lucide-react-native";

export default function MoreScreen() {
  const { claims } = useSession();
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();
  const fetching = useIsFetching();

  // Theme from AsyncStorage; sync UI
  const [isDark, setIsDark] = (() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const prefersDark = typeof window !== "undefined" && window?.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return [stored === "dark" ? true : prefersDark ? true : false, setIsDark];
  })();

  const toggleDark = () => {
    setIsDark((v) => !v);
    typeof window !== "undefined" && localStorage.setItem("theme", isDark ? "light" : "dark");
  };

  return (
    <Screen
      refreshing={fetching > 0}
      onRefresh={() => {}}
    >
      <GradientHeader title="More" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.container}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Theme</Text>
          <Switch
            value={isDark}
            onValueChange={toggleDark}
            thumbColor={isDark ? "#18181B" : "#FFFFFF"}
            trackColor={{ false: "#DDD", true: "#888" }}
          />
        </View>

        <Pressable onPress={() => router.push("/signout")} style={s.signOutBtn}>
          <View style={s.signRow}>
            <Text style={s.signIcon}>🔓</Text>
            <Text style={s.signLabel}>Sign out</Text>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    container: { padding: tokens.space.lg, gap: tokens.space.lg },
    section: { paddingBottom: tokens.space.md, borderBottomWidth: 1, borderBottomColor: t.color.line },
    sectionTitle: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    signOutBtn: {
      width: "100%",
      backgroundColor: "#EF4444",
      padding: tokens.space.md,
      borderRadius: tokens.radius.md,
      alignItems: "center",
    },
    signRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, color: t.color.ink },
    signIcon: { fontSize: 18 },
    signLabel: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  });
};