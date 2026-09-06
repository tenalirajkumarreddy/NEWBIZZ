import { Text, StyleSheet, View } from "react-native";
import * as Network from "expo-network";
import { tokens } from "@/theme/tokens";

export function ConnectivityPill() {
  const state = Network.useNetworkState();
  const online = state.isConnected !== false && state.isInternetReachable !== false;

  return (
    <View style={[s.pill, { backgroundColor: online ? tokens.color.grnWash : tokens.color.redWash }]}>
      <View style={[s.dot, { backgroundColor: online ? tokens.color.grn : tokens.color.red }]} />
      <Text style={[s.txt, { color: online ? tokens.color.grn : tokens.color.red }]}>
        {online ? "Online" : "Offline"}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: tokens.radius.full,
    paddingHorizontal: 10,
    height: 26,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  txt: {
    fontFamily: tokens.font.sansSemi,
    fontSize: 11,
  },
});
