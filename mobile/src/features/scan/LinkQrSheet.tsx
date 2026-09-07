import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Search, Store as StoreIcon } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { useStores } from "@/data/stores";
import { linkStoreQr } from "@/data/qr";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

export function LinkQrSheet({
  visible, code, onClose,
}: {
  visible: boolean;
  code: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const stores = useStores();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const filtered = useMemo(() => {
    const list = stores.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list.slice(0, 20);
    return list
      .filter((st) =>
        [st.name, st.area, st.customerName, st.code]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(needle)),
      )
      .slice(0, 20);
  }, [stores.data, q]);

  const selected = useMemo(
    () => (stores.data ?? []).find((st) => st.id === selectedId) ?? null,
    [stores.data, selectedId],
  );

  async function link() {
    if (!selected || linking) return;
    setLinking(true);
    try {
      await linkStoreQr(selected.id, code);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.qr(code) }),
        qc.invalidateQueries({ queryKey: qk.stores() }),
      ]);
      Toast.show({ type: "success", text1: "Code linked", text2: `${selected.name} - ${code}` });
      close();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not link code", text2: friendlyError(e) });
    } finally {
      setLinking(false);
    }
  }

  function close() {
    setQ("");
    setSelectedId(null);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close} title="Link code to a store">
      <View style={s.searchWrap}>
        <Search size={15} color={tokens.color.ink4} />
        <TextInput
          style={s.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Search stores..."
          placeholderTextColor={tokens.color.ink4}
        />
      </View>

      {selected ? (
        <View style={s.confirmCard}>
          <View style={s.confirmRow}>
            <View style={s.chip}>
              <StoreIcon size={15} color={tokens.color.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.confirmName} numberOfLines={1}>{selected.name}</Text>
              <Text style={s.confirmSub} numberOfLines={1}>
                {[selected.customerName, selected.area].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          <Text style={s.confirmCode}>
            Link code: <Text style={s.codeMono}>{code}</Text>
          </Text>
          <Pressable
            onPress={() => void link()}
            disabled={linking}
            style={({ pressed }) => [
              s.confirmBtn,
              pressed && { opacity: 0.85 },
              linking && { opacity: 0.5 },
            ]}
            accessibilityLabel="Confirm link code to store"
          >
            <Text style={s.confirmBtnTxt}>{linking ? "Linking..." : "Link code"}</Text>
          </Pressable>
          <Pressable onPress={() => setSelectedId(null)} style={s.changeBtn} accessibilityLabel="Choose a different store">
            <Text style={s.changeTxt}>Choose a different store</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.list}>
          {stores.isLoading ? (
            <SkeletonRows rows={4} />
          ) : stores.isError ? (
            <EmptyState title="Could not load stores" message={friendlyError(stores.error)} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No stores found" message="Try a different search term." />
          ) : (
            filtered.map((st) => (
              <Pressable
                key={st.id}
                onPress={() => setSelectedId(st.id)}
                accessibilityLabel={`Select store ${st.name}`}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: tokens.color.fill }]}
              >
                <View style={s.rowMain}>
                  <Text style={s.rowName} numberOfLines={1}>{st.name}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {[st.customerName, st.area].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.sm,
    backgroundColor: tokens.color.fill,
    borderWidth: 1, borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    minHeight: 44,
  },
  searchInput: {
    flex: 1, color: tokens.color.ink,
    fontFamily: tokens.font.sans, fontSize: tokens.size.sm,
    paddingVertical: 0,
  },
  list: { gap: 2, marginTop: tokens.space.md },
  row: {
    flexDirection: "row", alignItems: "center",
    minHeight: 44, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.sm,
  },
  rowMain: { flex: 1 },
  rowName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  rowSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  confirmCard: {
    marginTop: tokens.space.md,
    backgroundColor: tokens.color.grnWash,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: tokens.space.md,
  },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  chip: {
    width: 34, height: 34, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    alignItems: "center", justifyContent: "center",
  },
  confirmName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  confirmSub: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  confirmCode: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  codeMono: { fontFamily: tokens.font.monoBold, color: tokens.color.ink, fontVariant: ["tabular-nums"] },
  confirmBtn: {
    minHeight: 44, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    alignItems: "center", justifyContent: "center",
  },
  confirmBtnTxt: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  changeBtn: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  changeTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
});
