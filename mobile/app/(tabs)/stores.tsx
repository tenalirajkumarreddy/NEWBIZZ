import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import {
  StoresTabBody, AddStoreFab, useStoresRefresh,
} from "@/features/stores/StoresTabBody";
import { AddStoreWizard } from "@/features/stores/AddStoreWizard";
import { useSession } from "@/lib/session";

export default function StoresScreen() {
  const { can } = useSession();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { refreshing, onRefresh } = useStoresRefresh();

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <GradientHeader
          title="Stores"
          subtitle="Directory and quick actions"
          right={<HeaderRight />}
        />
        <StoresTabBody showRouteFilter />
      </Screen>
      {can("customer.manage") ? (
        <AddStoreFab onPress={() => setWizardOpen(true)} />
      ) : null}
      <AddStoreWizard visible={wizardOpen} onClose={() => setWizardOpen(false)} />
    </View>
  );
}
