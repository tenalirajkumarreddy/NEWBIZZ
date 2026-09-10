import { View, StyleSheet, ScrollView, RefreshControl, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function Screen({
  children, refreshing, onRefresh, scroll = true, style,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();

  if (!scroll) {
    return (
      <View style={[s.root, style]}>{children}</View>
    );
  }

  return (
    <View style={[s.root, style]}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: 96 + insets.bottom, flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={t.color.brand}
              colors={[t.color.brand]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.color.bg,
  },
  content: {
    paddingBottom: 96,
  },
});
  }, [palette]);
};
