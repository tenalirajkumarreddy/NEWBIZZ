import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Sheet } from "@/components/Sheet";
import { DropdownSelect } from "@/components/DropdownSelect";
import { SkeletonRows } from "@/components/SkeletonRows";
import { friendlyError } from "@/lib/rpc";
import { qk } from "@/data/keys";
import { useBranches, useStaff, createStockTransfer } from "@/data/operator";
import { useStockLevels } from "@/data/production";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Warehouse/branch -> staff stock handover. Single-line create over the
 * same create_transfer RPC used by cash handovers.
 */
export function StockHandoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const branches = useBranches();
  const staff = useStaff();
  const stock = useStockLevels();

  const [branchId, setBranchId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setBranchId(null);
      setUserId(null);
      setItemId(null);
      setQtyText("");
      setNoteText("");
      setBusy(false);
    }
  }, [visible]);

  const selectedBranch = useMemo(
    () => (branches.data ?? []).find((b) => b.id === branchId) ?? null,
    [branches.data, branchId],
  );

  const itemOptions = useMemo(() => {
    if (!selectedBranch) return [];
    return (stock.data ?? [])
      .filter((r) => r.branchName === selectedBranch.name && r.qtyOnHand > 0)
      .map((r) => ({
        value: r.itemId,
        label: `${r.itemName} (${r.qtyOnHand}${r.unit ? ` ${r.unit}` : ""})`,
      }));
  }, [selectedBranch, stock.data]);

  function onBranchChange(id: string) {
    setBranchId(id);
    setItemId(null);
  }

  const qty = Number(qtyText.trim().replace(/,/g, ""));
  const canSubmit = !!branchId && !!userId && !!itemId && Number.isFinite(qty) && qty > 0;

  async function submit() {
    if (busy) return;
    if (!branchId || !userId || !itemId || !(qty > 0)) {
      Toast.show({ type: "error", text1: "Fill in branch, recipient, item and a quantity above zero" });
      return;
    }
    setBusy(true);
    try {
      await createStockTransfer({
        fromBranchId: branchId,
        toUserId: userId,
        lines: [{ itemId, qty: Number(qtyText) }],
        note: noteText.trim() || null,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.custody() }),
        qc.invalidateQueries({ queryKey: qk.stockLevels() }),
      ]);
      Toast.show({ type: "success", text1: "Handover created", text2: "Waiting for the recipient to confirm" });
      onClose();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not create handover", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const loading = branches.isLoading || staff.isLoading;

  return (
    <Sheet visible={visible} onClose={() => { if (!busy) onClose(); }} title="Stock handover">
      <View style={s.body}>
        {loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            <View style={s.section}>
              <Text style={s.label}>FROM BRANCH</Text>
              <DropdownSelect
                label="From branch"
                value={branchId}
                options={(branches.data ?? []).map((b) => ({
                  value: b.id,
                  label: `${b.name}${b.isWarehouse ? " (warehouse)" : ""}`,
                }))}
                onChange={onBranchChange}
                placeholder="Select source branch"
              />
            </View>

            <View style={s.section}>
              <Text style={s.label}>RECIPIENT</Text>
              <DropdownSelect
                label="Recipient"
                value={userId}
                options={(staff.data ?? []).filter((w) => w.kind === "user").map((w) => ({
                  value: w.id,
                  label: w.name,
                }))}
                onChange={(v) => setUserId(v)}
                placeholder="Select staff member"
              />
            </View>

            <View style={s.section}>
              <Text style={s.label}>ITEM</Text>
              <DropdownSelect
                label="Item"
                value={itemId}
                options={itemOptions}
                onChange={(v) => setItemId(v)}
                placeholder={branchId ? "Select item in stock" : "Pick a branch first"}
              />
            </View>

            <View style={s.section}>
              <Text style={s.label}>QUANTITY</Text>
              <TextInput
                style={s.qtyInput}
                value={qtyText}
                onChangeText={(v) => setQtyText(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={t.color.ink4}
                accessible
                accessibilityLabel="Quantity"
              />
            </View>

            <View style={s.section}>
              <Text style={s.label}>NOTE (OPTIONAL)</Text>
              <TextInput
                style={s.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add a note for the recipient"
                placeholderTextColor={t.color.ink4}
                multiline
                accessible
                accessibilityLabel="Note"
              />
            </View>
          </>
        )}

        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit || busy}
          accessibilityRole="button"
          accessibilityLabel="Create stock handover"
          style={({ pressed }) => [
            s.submit,
            !canSubmit && s.submitDim,
            (pressed || busy) && { opacity: 0.85 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={s.submitTxt}>Create handover</Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
      body: { gap: tokens.space.lg },
      section: { gap: tokens.space.xs },
      label: {
        color: t.color.ink3,
        fontFamily: tokens.font.sansSemi,
        fontSize: tokens.size.eyebrow,
        letterSpacing: 0.6,
      },
      qtyInput: {
        minHeight: 52,
        borderWidth: 1,
        borderColor: t.color.line,
        borderRadius: tokens.radius.md,
        backgroundColor: t.color.surface,
        paddingHorizontal: tokens.space.md,
        color: t.color.ink,
        fontFamily: tokens.font.monoBold,
        fontSize: tokens.size.lg,
        fontVariant: ["tabular-nums"],
      },
      noteInput: {
        minHeight: 72,
        textAlignVertical: "top",
        borderWidth: 1,
        borderColor: t.color.line,
        borderRadius: tokens.radius.md,
        backgroundColor: t.color.surface,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        color: t.color.ink,
        fontFamily: tokens.font.sansMed,
        fontSize: tokens.size.sm,
      },
      submit: {
        minHeight: 44,
        borderRadius: tokens.radius.md,
        backgroundColor: t.color.brand,
        alignItems: "center",
        justifyContent: "center",
      },
      submitDim: { opacity: 0.45 },
      submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    });
  }, [palette]);
};
