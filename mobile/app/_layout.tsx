import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import Toast from "react-native-toast-message";
import { SessionProvider } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

// Same splash-style view as the gate screen — shown while the stored theme
// preference is loading so the route tree never flashes the wrong palette.
function ThemeGate({ children }: { children: React.ReactNode }) {
  const { palette, ready } = useTheme();
  const s = useStyles();
  if (!ready) {
    return (
      <View style={[s.splash, { backgroundColor: palette.color.brand }]}>
        <View style={[s.logo, { backgroundColor: palette.color.surface }]}>
          <Text style={[s.logoTxt, { color: palette.color.brand }]}>N</Text>
        </View>
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
      splash: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: t.space.lg,
      },
      logo: {
        width: 64,
        height: 64,
        borderRadius: t.radius.lg,
        alignItems: "center",
        justifyContent: "center",
      },
      logoTxt: {
        fontFamily: t.font.sansBold,
        fontSize: 32,
      },
    });
  }, [palette]);
};

export default function RootLayout() {
  const [loaded] = Font.useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_700Bold,
  });
  if (!loaded) return null;
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <SessionProvider>
          <ThemedStatusBar />
          <ThemeGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="record" options={{ presentation: "fullScreenModal" }} />
            </Stack>
            <Toast />
          </ThemeGate>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
