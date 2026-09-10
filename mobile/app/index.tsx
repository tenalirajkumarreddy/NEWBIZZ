import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";
import { isGatedStatus } from "@/lib/claims";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

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
  return <Redirect href="/(tabs)/home" />;
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.lg,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.lg,
    backgroundColor: t.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTxt: {
    color: t.color.brand,
    fontFamily: tokens.font.sansBold,
    fontSize: 32,
  },
});
  }, [palette]);
};
