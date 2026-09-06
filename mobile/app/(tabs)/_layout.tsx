import { View, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";

export default function TabsLayout() {
  return <View style={s.root} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
});
