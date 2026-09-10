import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";
import { isGatedStatus } from "@/lib/claims";
import { tokens } from "@/theme/tokens";

export default function Gate() {
  const { session, claims, loading } = useSession();

  if (loading) {
    return (
      <View style={s.splash}>
        <View style={s.logo}>
          <Text style={s.logoTxt}>N</Text>
        </View>
        <ActivityIndicator color={tokens.color.surface} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (isGatedStatus(claims.status)) return <Redirect href="/pending" />;
  return <Redirect href="/(tabs)/home" />;
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.lg,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTxt: {
    color: tokens.color.brand,
    fontFamily: tokens.font.sansBold,
    fontSize: 32,
  },
});
