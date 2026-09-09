import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Link2, Maximize2, QrCode, Search, Store as StoreIcon } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { GradientHeader } from "@/components/GradientHeader";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStores } from "@/data/stores";
import { linkStoreQr } from "@/data/qr";
import { supabase } from "@/lib/supabase";
import { qk } from "@/data/keys";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

interface QrRow {
  id: string;
  code: string;
  label: string | null;
  active: boolean;
  created_at: string;
}

function useStoreQrCodes(storeId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ["storeQrCodes", storeId ?? ""],
    enabled: !!user?.id && !!storeId,
    queryFn: async (): Promise<QrRow[]> => {
      const { data, error } = await supabase
        .from("store_qr_codes")
        .select("id, code, label, active, created_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QrRow[];
    },
  });
}

export default function StoreQrAdminScreen() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ storeId?: string }>();
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof params.storeId === "string" && params.storeId ? params.storeId : null,
  );
  const [linking, setLinking] = useState(false);
  const [fullCode, setFullCode] = useState<string | null>(null);

  const stores = useStores();
  const selected = useMemo(
    () => (stores.data ?? []).find((st) => st.id === selectedId) ?? null,
    [stores.data, selectedId],
  );
  const codes = useStoreQrCodes(selectedId);

  const rows = useMemo(() => {
    const all = stores.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all.slice(0, 30);
    return all
      .filter((st) =>
        [st.name, st.area, st.customerName, st.code].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        ),
      )
      .slice(0, 30);
  }, [stores.data, search]);

  async function generateAndLink() {
    if (!selected || linking) return;
    setLinking(true);
    try {
      // QR payloads must be scanner-safe: uppercase alnum + dash/underscore
      // only (spaces break parseQrPayload and many scanner apps).
      const base = (selected.code ?? selectedId!.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
      const code = `NB-${base || selectedId!.slice(0, 8).toUpperCase()}`;
      const linked = await linkStoreQr(selected.id, code);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.qr(linked) }),
        qc.invalidateQueries({ queryKey: qk.qr(code) }),
        qc.invalidateQueries({ queryKey: ["storeQrCodes", selected.id] }),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Toast.show({ type: "success", text1: "Code linked", text2: `${selected.name} · ${code}` });
      codes.refetch();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not link code", text2: friendlyError(e) });
    } finally {
      setLinking(false);
    }
  }

  if (!can("customer.manage")) {
    return (
      <View style={s.root}>
        <GradientHeader title="Store QR codes" subtitle="Generate and link codes" />
        <View style={s.body}>
          <EmptyState
            title="No permission"
            message="You do not have permission to manage store QR codes."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <GradientHeader
        title="Store QR codes"
        subtitle="Generate and link codes"
        right={
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85 }]}
          >
            <ArrowLeft size={16} color="#ffffff" />
          </Pressable>
        }
      />

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, { paddingBottom: 96 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {!selected ? (
          <>
            <View style={s.searchBox}>
              <Search size={15} color={tokens.color.ink4} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search stores to manage QR codes"
                placeholderTextColor={tokens.color.ink4}
                accessible
                accessibilityLabel="Search stores"
              />
            </View>

            {stores.isLoading ? (
              <SkeletonRows rows={5} />
            ) : stores.isError ? (
              <EmptyState title="Could not load stores" message={friendlyError(stores.error)} />
            ) : rows.length === 0 ? (
              <EmptyState icon={StoreIcon} title="No stores found" message="Try a different search." />
            ) : (
              <View style={s.list}>
                {rows.map((st) => (
                  <Pressable
                    key={st.id}
                    onPress={() => setSelectedId(st.id)}
                    accessibilityLabel={`Manage QR codes for ${st.name}`}
                    style={({ pressed }) => [s.row, pressed && { backgroundColor: tokens.color.fill }]}
                  >
                    <View style={s.rowChip}>
                      <Text style={s.rowChipTxt}>{st.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={s.rowMain}>
                      <Text style={s.rowName} numberOfLines={1}>{st.name}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>
                        {[st.customerName, st.area].filter(Boolean).join(" · ") || "—"}
                      </Text>
                    </View>
                    {st.code ? <Text style={s.rowCode}>{st.code}</Text> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Pressable
              onPress={() => setSelectedId(null)}
              accessibilityLabel="Choose a different store"
              style={({ pressed }) => [s.picked, pressed && { opacity: 0.85 }]}
            >
              <View style={s.pickedChip}>
                <Text style={s.pickedChipTxt}>{selected.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={s.rowMain}>
                <Text style={s.rowName} numberOfLines={1}>{selected.name}</Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {[selected.customerName, selected.area].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
              <Text style={s.changeTxt}>Change</Text>
            </Pressable>

            <Text style={s.sectionTitle}>Linked codes</Text>
            {codes.isLoading ? (
              <SkeletonRows rows={2} />
            ) : codes.isError ? (
              <EmptyState title="Could not load codes" message={friendlyError(codes.error)} />
            ) : (codes.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={QrCode}
                title="No codes linked"
                message="Generate a QR code for this store to print and paste at the counter."
              />
            ) : (
              <View style={s.list}>
                {codes.data!.map((qr) => (
                  <View key={qr.id} style={s.codeCard}>
                    <View style={s.qrWrap}>
                      <QRCode value={qr.code} size={200} color={tokens.color.ink} backgroundColor="#ffffff" />
                    </View>
                    <View style={s.codeMeta}>
                      <Text style={s.codeVal}>{qr.code}</Text>
                      {qr.label ? <Text style={s.codeLabel}>{qr.label}</Text> : null}
                      <Text style={s.codeDate}>{qr.created_at.slice(0, 10)}</Text>
                      <Pressable
                        onPress={() => setFullCode(qr.code)}
                        accessibilityLabel="Show QR code full screen"
                        style={({ pressed }) => [s.fullBtn, pressed && { opacity: 0.85 }]}
                      >
                        <Maximize2 size={14} color={tokens.color.brand} />
                        <Text style={[s.fullBtnTxt, { color: tokens.color.brand }]}>Show full screen</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => void generateAndLink()}
              disabled={linking}
              accessibilityLabel="Generate and link QR code"
              style={({ pressed }) => [
                s.genBtn,
                pressed && { opacity: 0.9 },
                linking && { opacity: 0.55 },
              ]}
            >
              <Link2 size={15} color="#ffffff" />
              <Text style={s.genBtnTxt}>
                {linking ? "Linking..." : "Generate & link"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal
        visible={fullCode != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullCode(null)}
      >
        <Pressable style={s.fullModal} onPress={() => setFullCode(null)}>
          <View style={s.fullCard}>
            {fullCode ? (
              <QRCode value={fullCode} size={280} color={tokens.color.ink} backgroundColor="#ffffff" />
            ) : null}
            <Text style={s.fullCodeTxt}>{fullCode}</Text>
            <Text style={s.fullHint}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    margin: -tokens.space.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
  },
  searchInput: {
    flex: 1,
    color: tokens.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
    paddingVertical: 0,
  },
  list: { gap: tokens.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 56,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    backgroundColor: tokens.color.surface,
  },
  rowChip: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  rowChipTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  rowSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  rowCode: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 56,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.brand,
    backgroundColor: tokens.color.brandWash,
  },
  pickedChip: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pickedChipTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  changeTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  sectionTitle: {
    color: tokens.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    marginTop: tokens.space.xs,
  },
  codeCard: {
    flexDirection: "row",
    gap: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  qrWrap: {
    width: 200,
    height: 200,
    borderRadius: tokens.radius.md,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  codeMeta: { flex: 1, minWidth: 0, gap: tokens.space.xs },
  codeVal: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  codeLabel: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  codeDate: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.eyebrow,
    fontVariant: ["tabular-nums"],
  },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    alignSelf: "flex-start",
    paddingHorizontal: tokens.space.sm,
    marginTop: "auto",
  },
  fullBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
  },
  genBtnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  fullModal: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullCard: {
    backgroundColor: "#ffffff",
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xl,
    alignItems: "center",
    gap: tokens.space.md,
  },
  fullCodeTxt: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  fullHint: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
  },
});
