import { Text, StyleSheet, View } from "react-native";
import * as Network from "expo-network";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function ConnectivityPill() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const state = Network.useNetworkState();
  const online = state.isConnected !== false && state.isInternetReachable !== false;

  return (
    <View style={[s.pill, { backgroundColor: online ? t.color.grnWash : t.color.redWash }]}>
      <View style={[s.dot, { backgroundColor: online ? t.color.grn : t.color.red }]} />
      <Text style={[s.txt, { color: online ? t.color.grn : t.color.red }]}>
        {online ? "Online" : "Offline"}
      </Text>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
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
  }, [palette]);
};
