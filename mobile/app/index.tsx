import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";

export default function Index() {
  return (
    <View style={[s.root, { backgroundColor: tokens.color.bg }]}>
      <Text style={{ color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.xl }}>
        NEWBIZZ
      </Text>
    </View>
  );
}
const s = StyleSheet.create({ root: { flex: 1, alignItems: "center", justifyContent: "center" } });
