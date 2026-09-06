import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as Font from "expo-font";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import Toast from "react-native-toast-message";

export default function RootLayout() {
  const [loaded] = Font.useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_700Bold,
  });
  useEffect(() => { void loaded; }, [loaded]);
  if (!loaded) return null;
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
