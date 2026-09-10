import { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Check, Info, Plus, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { DropdownSelect } from "@/components/DropdownSelect";
import { Sheet } from "@/components/Sheet";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { createCashTransfer } from "@/data/transfers";
import { uploadTransactionImages } from "@/data/attachments";
import { useActiveUsers } from "@/data/users";
import { qk } from "@/data/keys";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export type HandoverMode = "handover" | "deposit";
const MAX_IMAGES = 5;

export function HandoverSheet({
  visible, onClose, mode, initialImages,
}: {
  visible: boolean;
  onClose: () => void;
  mode: HandoverMode;
  /** Receipts received via the share sheet, pre-attached. */
  initialImages?: string[];
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const { user } = useSession();
  const users = useActiveUsers();
  const [toUserId, setToUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setToUserId(null);
      setAmount("0");
      setNote("");
      setImages(initialImages ? initialImages.slice(0, MAX_IMAGES) : []);
    }
  }, [visible, mode, initialImages]);

  async function addImages() {
    if (images.length >= MAX_IMAGES) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.6,
    });
    if (!res.canceled && res.assets?.length) {
      setImages((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
    }
  }

  const recipients = (users.data ?? []).filter((u) => u.id !== user?.id);

  async function submit() {
    if (busy) return;
    const n = Number(amount.trim().replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      Toast.show({ type: "error", text1: "Enter an amount greater than zero" });
      return;
    }
    if (mode === "handover" && !toUserId) {
      Toast.show({ type: "error", text1: "Select who will receive the cash" });
      return;
    }
    setBusy(true);
    try {
      const transferId = await createCashTransfer(
        mode === "deposit" ? null : toUserId,
        Math.round(n * 100) / 100,
        note.trim() || null,
      );
      let attached = 0;
      if (images.length > 0) {
        attached = await uploadTransactionImages(images, "transfers", transferId);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.custody() }),
        qc.invalidateQueries({ queryKey: ["txnImages", "transfers", transferId] }),
      ]);
      Toast.show({
        type: "success",
        text1: mode === "deposit" ? "Deposit posted" : "Handover created",
        text2: attached > 0
          ? `${attached} receipt${attached === 1 ? "" : "s"} attached`
          : mode === "deposit"
            ? "Cash will be posted to the bank account"
            : "Waiting for the recipient to confirm",
      });
      onClose();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not submit", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={mode === "deposit" ? "Deposit to bank" : "Hand over cash"}
    >
      <View style={s.body}>
        {mode === "handover" ? (
          <View style={s.section}>
            <Text style={s.label}>RECIPIENT</Text>
            {users.isLoading ? (
              <SkeletonRows rows={3} />
            ) : recipients.length === 0 ? (
              <Text style={s.hint}>No other active users found.</Text>
            ) : (
              <DropdownSelect
                label="Recipient"
                value={toUserId}
                options={recipients.map((u) => ({
                  value: u.id,
                  label: u.full_name,
                  sub: initials(u.full_name),
                }))}
                onChange={(v) => setToUserId(v)}
                placeholder="Select who will receive the cash"
              />
            )}
          </View>
        ) : (
          <View style={s.infoBox}>
            <Info size={14} color={t.color.brand} />
            <Text style={s.infoTxt}>Cash will be posted to the bank account (1120).</Text>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.label}>AMOUNT</Text>
          <View style={s.amountWrap}>
            <Text style={s.rupee}>{String.fromCharCode(8377)}</Text>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              accessible
              accessibilityLabel="Amount"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note for the recipient"
            placeholderTextColor={t.color.ink4}
            multiline
            accessible
            accessibilityLabel="Note"
          />
        </View>

        <View style={s.section}>
          <Text style={s.label}>RECEIPTS (UPTO {MAX_IMAGES})</Text>
          <View style={s.imageRow}>
            {images.map((uri, i) => (
              <View key={`${uri}-${i}`} style={s.imageWrap}>
                <Image source={{ uri }} style={s.image} />
                <Pressable
                  onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  accessibilityLabel={`Remove receipt ${i + 1}`}
                  style={({ pressed }) => [s.imageRemove, pressed && { opacity: 0.7 }]}
                >
                  <X size={11} color="#ffffff" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <Pressable
                onPress={() => void addImages()}
                accessibilityLabel="Add receipt image"
                style={({ pressed }) => [s.imageAdd, pressed && { opacity: 0.8 }]}
              >
                <Plus size={18} color={t.color.ink3} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          accessibilityLabel="Submit"
          style={({ pressed }) => [s.submit, (pressed || busy) && { opacity: 0.85 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={s.submitTxt}>{mode === "deposit" ? "Deposit to bank" : "Create handover"}</Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
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
  hint: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  people: { gap: tokens.space.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 52,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  personActive: { borderColor: t.color.brand, backgroundColor: t.color.brandWash },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  personName: { flex: 1, color: t.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brandWash,
  },
  infoTxt: {
    flex: 1,
    color: t.color.brandD,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
  },
  rupee: {
    color: t.color.ink3,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.lg,
  },
  amountInput: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xl,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
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
  imageRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  imageWrap: { width: 56, height: 56 },
  image: { width: 56, height: 56, borderRadius: tokens.radius.md, backgroundColor: t.color.fill },
  imageRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageAdd: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.color.surface,
  },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
  }, [palette]);
};
