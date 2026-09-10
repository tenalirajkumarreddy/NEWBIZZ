import { useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/theme/ThemeContext";
import { tokens } from "@/theme/tokens";

/**
 * OAuth deep-link target: newbizz://auth/callback
 *
 * The tokens in the redirect URL are consumed by the flow that opened the
 * browser (WebBrowser.openAuthSessionAsync in src/data/googleAuth.ts). This
 * screen only absorbs the deep-link intent so expo-router never shows
 * "Unmatched route", then hands control back to the caller.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={[s.wrap, { backgroundColor: t.color.bg }]}>
      <ActivityIndicator color={t.color.brand} />
      <Text style={s.txt}>Completing Google sign-in…</Text>
    </View>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.space.md,
    },
    txt: { color: t.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  });
};
