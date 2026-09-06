import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { EmptyState } from "@/components/EmptyState";
import { HeaderRight } from "@/components/HeaderRight";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { tokens } from "@/theme/tokens";

export function PlaceholderScreen({ title, message }: { title: string; message: string }) {
  const { claims } = useSession();
  return (
    <Screen>
      <GradientHeader title={title} subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        <EmptyState title="Coming soon" message={message} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: tokens.space.lg,
  },
});
