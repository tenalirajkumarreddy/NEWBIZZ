import { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { ScanLine, MapPin, IndianRupee, HandCoins, Footprints, UserPlus, Store as StoreIcon } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { Sheet } from "@/components/Sheet";
import { QrViewport } from "@/features/scan/QrViewport";
import { IdentifiedStoreCard, UnlinkedCodeCard } from "@/features/scan/IdentifiedStoreCard";
import { NearbyStores } from "@/features/scan/NearbyStores";
import { LinkQrSheet } from "@/features/scan/LinkQrSheet";
import { useSession } from "@/lib/session";
import { parseQrPayload } from "@/lib/qrparse";
import { resolveStoreQr } from "@/data/qr";
import { friendlyError } from "@/lib/rpc";
import { qk } from "@/data/keys";
import { tokens } from "@/theme/tokens";
import type { ResolvedStore } from "@/data/qr";
import { useTheme } from "@/theme/ThemeContext";

type Mode = "qr" | "nearby";

function SegmentedToggle({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
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
            <Icon size={14} color={selected ? t.color.surface : t.color.ink3} />
            <Text style={[s.segTxt, selected && s.segTxtOn]}>{v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScanScreen() {
  const s = useStyles();
  const qc = useQueryClient();
  const router = useRouter();
  const { can } = useSession();
  const [mode, setMode] = useState<Mode>("qr");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedStore | null>(null);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [notFoundPayee, setNotFoundPayee] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function bumpReset() {
    setResetKey((k) => k + 1);
  }

  function resetScan() {
    setResolved(null);
    setSheetCode(null);
    setNotFoundCode(null);
    setNotFoundPayee(null);
    bumpReset();
  }

  async function handleScan(raw: string) {
    if (resolving || sheetCode || notFoundCode) return;
    const parsed = parseQrPayload(raw);
    if (!parsed) {
      Toast.show({ type: "error", text1: "Not a valid store code" });
      return;
    }
    setResolving(true);
    setResolved(null);
    try {
      const store = await resolveStoreQr(parsed.code);
      if (store.found && store.store_id) {
        setResolved(store);
      } else {
        // Unassigned QR (NEWBIZZ code, shop's UPI payment QR, anything):
        // offer to create a store for it or link it to an existing store.
        setNotFoundCode(parsed.code);
        setNotFoundPayee(parsed.payee ?? null);
      }
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
  const resultOpen = showIdentified || notFoundCode != null;

  return (
    <Screen onRefresh={onRefresh}>
      <GradientHeader title="Scan" subtitle="Store QR and nearby stops" right={<HeaderRight />} />

      <View style={s.body}>
        <SegmentedToggle value={mode} onChange={setMode} />

        {mode === "qr" ? (
          <>
            <QrViewport
              paused={resolving || resultOpen || sheetCode != null}
              resolving={resolving}
              onScan={(raw) => void handleScan(raw)}
              resetKey={resetKey}
            />
            {!resultOpen ? <QuickActions /> : null}
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
      </View>

      {/* Scan result pops up as a sheet - no scrolling needed; dismissing
          resumes the scanner automatically. */}
      <Sheet
        visible={resultOpen}
        onClose={resetScan}
        title={showIdentified ? "Store details" : "No store found"}
      >
        {showIdentified ? (
          <View style={s.sheetBody}>
            <IdentifiedStoreCard store={resolved!} onAfterVisit={resetScan} />
            <ScanAnotherButton label="Scan another code" onPress={resetScan} />
          </View>
        ) : notFoundCode ? (
          <View style={s.sheetBody}>
                <UnlinkedCodeCard
                  code={notFoundCode}
                  payee={notFoundPayee}
                  canManage={can("customer.manage")}
                  onLink={() => {
                    // close the result sheet so only the link sheet is on top
                    const c = notFoundCode;
                    setNotFoundCode(null);
                    setNotFoundPayee(null);
                    setSheetCode(c);
                  }}
                  onCreate={() => {
                    const c = notFoundCode;
                    resetScan();
                    router.push(`/stores?add=1&qrCode=${encodeURIComponent(c)}`);
                  }}
                />
            <ScanAnotherButton label="Scan another code" onPress={resetScan} />
          </View>
        ) : null}
      </Sheet>

      <LinkQrSheet visible={sheetCode != null} code={sheetCode ?? ""} onClose={resetScan} />
    </Screen>
  );
}

/** Always-available actions: open the record flow and pick the store there. */
function QuickActions() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const { can } = useSession();

  const actions: { key: string; label: string; icon: typeof IndianRupee; tone: "grn" | "amb" | "brand"; href: string; show: boolean }[] = [
    { key: "sale", label: "Record sale", icon: IndianRupee, tone: "grn", href: "/record?mode=sale", show: can("cashmemo.create") || can("order.create") },
    { key: "collect", label: "Record collection", icon: HandCoins, tone: "amb", href: "/record?mode=collect", show: can("receipt.record") || can("invoice.payment") },
    { key: "visit", label: "Mark visit", icon: Footprints, tone: "brand", href: "/mark-visit", show: can("field.routes") },
  ];
  const visible = actions.filter((a) => a.show);
  if (visible.length === 0 && !can("customer.manage")) return null;

  return (
    <View style={s.quickWrap}>
      {visible.map((a) => {
        const Icon = a.icon;
        const wash = { brand: t.color.brandWash, grn: t.color.grnWash, amb: t.color.ambWash }[a.tone];
        const fg = { brand: t.color.brand, grn: t.color.grn, amb: t.color.amb }[a.tone];
        return (
          <Pressable
            key={a.key}
            onPress={() => router.push(a.href as never)}
            accessibilityLabel={a.label}
            style={({ pressed }) => [s.quickBtn, { backgroundColor: wash }, pressed && { opacity: 0.85 }]}
          >
            <Icon size={16} color={fg} />
            <Text style={[s.quickTxt, { color: fg }]} numberOfLines={1}>{a.label}</Text>
          </Pressable>
        );
      })}
      {can("customer.manage") ? (
        <>
          <Pressable
            onPress={() => router.push("/stores?add=1&mode=customer")}
            accessibilityLabel="Create customer"
            style={({ pressed }) => [s.quickBtn, { backgroundColor: t.color.fill }, pressed && { opacity: 0.85 }]}
          >
            <UserPlus size={16} color={t.color.ink2} />
            <Text style={[s.quickTxt, { color: t.color.ink2 }]} numberOfLines={1}>Create customer</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/stores?add=1")}
            accessibilityLabel="Create store"
            style={({ pressed }) => [s.quickBtn, { backgroundColor: t.color.fill }, pressed && { opacity: 0.85 }]}
          >
            <StoreIcon size={16} color={t.color.ink2} />
            <Text style={[s.quickTxt, { color: t.color.ink2 }]} numberOfLines={1}>Create store</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function ScanAnotherButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [s.rescan, pressed && { opacity: 0.7 }]}
    >
      <ScanLine size={14} color={t.color.ink3} />
      <Text style={s.rescanTxt}>{label}</Text>
    </Pressable>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  seg: {
    flexDirection: "row",
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.full,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: tokens.radius.full,
  },
  segBtnOn: {
    backgroundColor: t.color.brand,
    ...t.shadow.card,
  },
  segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  segTxtOn: { color: t.color.surface, fontFamily: tokens.font.sansSemi },
  sheetBody: { gap: tokens.space.md },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.xs,
  },
  quickTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  rescan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  rescanTxt: { color: t.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
});
  }, [palette]);
};
