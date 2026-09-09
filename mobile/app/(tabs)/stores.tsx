import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
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
  // Deep-link from the scanner's "no store found" popup:
  // /stores?add=1&qrCode=<code> opens the add wizard and auto-links the QR
  // after the store is created.
  const params = useLocalSearchParams<{ add?: string; qrCode?: string }>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const consumed = useRef(false);
  const { refreshing, onRefresh } = useStoresRefresh();

  useEffect(() => {
    if (consumed.current) return;
    if (params.add === "1") {
      consumed.current = true;
      setLinkCode(typeof params.qrCode === "string" ? params.qrCode : null);
      setWizardOpen(true);
    }
  }, [params.add, params.qrCode]);

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
        <AddStoreFab onPress={() => {
          setLinkCode(null);
          setWizardOpen(true);
        }} />
      ) : null}
      <AddStoreWizard
        visible={wizardOpen}
        linkCode={linkCode}
        onClose={() => {
          setWizardOpen(false);
          setLinkCode(null);
        }}
      />
    </View>
  );
}
