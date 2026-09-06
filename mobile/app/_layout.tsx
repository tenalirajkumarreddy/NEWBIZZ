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

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export default function RootLayout() {
  const [loaded] = Font.useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_700Bold,
  });
  if (!loaded) return null;
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
        <Toast />
      </SessionProvider>
    </QueryClientProvider>
  );
}
