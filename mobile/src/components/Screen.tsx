import { View, StyleSheet, ScrollView, RefreshControl, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function Screen({
  children, refreshing, onRefresh, scroll = true, style,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
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
              tintColor={tokens.color.brand}
              colors={[tokens.color.brand]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  content: {
    paddingBottom: 96,
  },
});
