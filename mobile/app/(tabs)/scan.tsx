import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { ScanLine, MapPin } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { QrViewport } from "@/features/scan/QrViewport";
import { IdentifiedStoreCard, UnlinkedCodeCard } from "@/features/scan/IdentifiedStoreCard";
import { NearbyStores } from "@/features/scan/NearbyStores";
import { LinkQrSheet } from "@/features/scan/LinkQrSheet";
import { parseQrPayload } from "@/lib/qrparse";
import { resolveStoreQr } from "@/data/qr";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { qk } from "@/data/keys";
import { tokens } from "@/theme/tokens";
import type { ResolvedStore } from "@/data/qr";

type Mode = "qr" | "nearby";

function SegmentedToggle({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  return (
    <View style={s.seg}>
      {(
        [
          { key: "qr", label: "QR", icon: ScanLine },
          { key: "nearby", label: "Nearby", icon: MapPin },
        ] as const
      ).map((v) => {
        const Icon = v.icon;
        const selected = v.key === value;
        return (
          <Pressable
            key={v.key}
            onPress={() => onChange(v.key)}
            accessibilityLabel={`${v.label} mode`}
            accessibilityState={{ selected }}
            style={({ pressed }) => [s.segBtn, selected && s.segBtnOn, pressed && { opacity: 0.85 }]}
          >
            <Icon size={14} color={selected ? tokens.color.surface : tokens.color.ink3} />
            <Text style={[s.segTxt, selected && s.segTxtOn]}>{v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScanScreen() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [mode, setMode] = useState<Mode>("qr");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedStore | null>(null);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function bumpReset() {
    setResetKey((k) => k + 1);
  }

  function resetScan() {
    setResolved(null);
    setSheetCode(null);
    bumpReset();
  }

  async function handleScan(raw: string) {
    if (resolving || sheetCode) return;
    const code = parseQrPayload(raw);
    if (!code) {
      Toast.show({ type: "error", text1: "Not a valid store code" });
      bumpReset();
      return;
    }
    setResolving(true);
    setResolved(null);
    try {
      const store = await resolveStoreQr(code);
      setResolved(store);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not resolve code", text2: friendlyError(e) });
      bumpReset();
    } finally {
      setResolving(false);
    }
  }

  async function onRefresh() {
    await qc.invalidateQueries({ queryKey: qk.stores() });
  }

  const showIdentified = resolved != null && resolved.found && !!resolved.store_id;
  const showUnlinked = resolved != null && !showIdentified;

  return (
    <Screen onRefresh={onRefresh}>
      <GradientHeader title="Scan" subtitle="Store QR and nearby stops" right={<HeaderRight />} />

      <View style={s.body}>
        <SegmentedToggle value={mode} onChange={setMode} />

        {mode === "qr" ? (
          <>
            <QrViewport
              paused={resolving || resolved != null || sheetCode != null}
              resolving={resolving}
              onScan={(raw) => void handleScan(raw)}
              resetKey={resetKey}
            />

            {showIdentified ? (
              <>
                <IdentifiedStoreCard store={resolved!} onAfterVisit={resetScan} />
                <ScanAnotherButton label="Scan another code" onPress={resetScan} />
              </>
            ) : showUnlinked ? (
              <>
                <UnlinkedCodeCard
                  code={resolved!.code}
                  canManage={can("customer.manage")}
                  onLink={() => setSheetCode(resolved!.code)}
                />
                <ScanAnotherButton label="Scan another code" onPress={resetScan} />
              </>
            ) : null}
          </>
        ) : (
          <>
            {showIdentified ? (
              <>
                <IdentifiedStoreCard store={resolved!} onAfterVisit={resetScan} />
                <ScanAnotherButton label="Back to nearby list" onPress={resetScan} />
              </>
            ) : (
              <NearbyStores
                refreshKey={resetKey}
                onOpen={(store) => {
                  setResolved(store);
                  bumpReset();
                }}
              />
            )}
          </>
        )}
      </View>

      <LinkQrSheet visible={sheetCode != null} code={sheetCode ?? ""} onClose={resetScan} />
    </Screen>
  );
}

function ScanAnotherButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [s.rescan, pressed && { opacity: 0.7 }]}
    >
      <ScanLine size={14} color={tokens.color.ink3} />
      <Text style={s.rescanTxt}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  seg: {
    flexDirection: "row",
    backgroundColor: tokens.color.fill,
    borderRadius: tokens.radius.full,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: tokens.radius.full,
  },
  segBtnOn: {
    backgroundColor: tokens.color.brand,
    ...tokens.shadow.card,
  },
  segTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  segTxtOn: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi },
  rescan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  rescanTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
});
