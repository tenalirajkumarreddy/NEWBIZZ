import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import * as Notifications from "expo-notifications";
import Toast from "react-native-toast-message";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import {
  registerPushToken, configureForegroundNotifications, tapDestination,
} from "@/data/push";
import { shareInbox, isAndroid } from "@/data/shareInbox";
import { qk } from "@/data/keys";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

/**
 * Receives images shared into the app (Android share sheet) and routes to
 * the share-received screen. Cold-start shares are handled by the screen
 * itself; this covers shares while the app is already running.
 */
function ShareIntentBridge() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isAndroid()) return;
    let ReceiveSharingIntent: any = null;
    try {
      ReceiveSharingIntent = require("react-native-receive-sharing-intent").default;
    } catch {
      return;
    }
    ReceiveSharingIntent.getReceivedFiles(
      (files: any[]) => {
        const imgs = (files ?? [])
          .filter((f) => (f.mimeType ?? "").startsWith("image/") && f.filePath)
          .map((f) => ({ uri: f.filePath as string, name: f.fileName as string }));
        if (imgs.length === 0) return;
        shareInbox.set(imgs);
        if (segments[segments.length - 1] !== "share-received") {
          router.push("/share-received");
        }
      },
      () => {},
    );
  }, [router, segments]);

  return null;
}

/** Registers the device push token once a session exists, handles taps. */
function PushBridge() {
  const { user } = useSession();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    configureForegroundNotifications();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void registerPushToken();
    // Refresh unread badge when a push lands while the app runs.
    const sub = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: qk.unread() });
      void qc.invalidateQueries({ queryKey: qk.notifications() });
    });
    return () => sub.remove();
  }, [user?.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const { actionUrl } = tapDestination(res);
      if (actionUrl && actionUrl.startsWith("/")) {
        const inTabs = segments[0] === "(tabs)";
        if (inTabs) router.push(actionUrl as never);
        else router.replace(actionUrl as never);
      }
    });
    return () => sub.remove();
  }, [router, segments]);

  return null;
}

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
          <PushBridge />
          <ShareIntentBridge />
          <ThemedStatusBar />
          <ThemeGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="record" options={{ presentation: "fullScreenModal" }} />
              <Stack.Screen name="share-received" options={{ presentation: "transparentModal" }} />
            </Stack>
            <Toast />
          </ThemeGate>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
