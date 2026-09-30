import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";
import { isGatedStatus, isPortal } from "@/lib/claims";
import { HOME_TAB } from "@/lib/tabs";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";
import { useMemo } from "react";

export default function Gate() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const { session, claims, loading } = useSession();

  if (loading) {
    return (
      <View style={s.splash}>
        <View style={s.logo}>
          <Text style={s.logoTxt}>N</Text>
        </View>
        <ActivityIndicator color={t.color.surface} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (isGatedStatus(claims.status)) return <Redirect href="/pending" />;
  // Portal principals (customers): zero roles + a stamped portal customer id.
  if (isPortal(claims)) return <Redirect href="/(tabs)/c-home" />;
  const homeTab = claims.roles.includes("operator")
    ? HOME_TAB.operator
    : claims.roles.includes("agent")
      ? HOME_TAB.agent
      : HOME_TAB.manager;
  return <Redirect href={`/(tabs)/${homeTab}`} />;
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return useMemo(() => StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.md,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoTxt: { color: "#ffffff", fontFamily: tokens.font.sansBold, fontSize: 30 },
}), [t]);
};
