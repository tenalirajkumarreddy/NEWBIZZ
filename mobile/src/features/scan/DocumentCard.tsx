import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as WebBrowser from "expo-web-browser";
import Toast from "react-native-toast-message";
import { FileText, Truck, ClipboardList, Undo2, ExternalLink, RefreshCw } from "lucide-react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { moneyINR, dateIST } from "@/lib/format";
import { documentWebUrl, type ResolvedDoc } from "@/data/docs";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const KIND_META: Record<string, { label: string; icon: typeof FileText }> = {
  invoice: { label: "Tax Invoice", icon: FileText },
  challan: { label: "Delivery Challan", icon: Truck },
  order: { label: "Sales Order", icon: ClipboardList },
  creditnote: { label: "Credit Note", icon: Undo2 },
};

/** Scan result for a newbizz://d/… document QR: identity strip + metadata,
 * with the web print/app view one tap away (PDF/share lives on web). */
export function DocumentCard({ doc, onRescan }: { doc: ResolvedDoc; onRescan: () => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();

  const kindMeta = KIND_META[doc.kind] ?? KIND_META.invoice;
  const Icon = kindMeta.icon;

  const rows = useMemo(() => {
    if (!doc.meta) return null;
    const m = doc.meta;
    const out: { label: string; value: string; mono?: boolean }[] = [];
    if (m.no) out.push({ label: "Number", value: m.no, mono: true });
    if (m.date) out.push({ label: "Date", value: dateIST(m.date.slice(0, 10)) });
    if (m.total != null) {
      out.push({
        label: doc.kind === "challan" ? "Total units" : "Amount",
        value: doc.kind === "challan" ? String(m.total) : moneyINR(m.total),
        mono: true,
      });
    }
    return out;
  }, [doc]);

  if (!doc.meta) {
    return (
      <View style={[s.card, s.muted]}>
        <View style={s.headRow}>
          <Icon size={16} color={t.color.ink4} />
          <Text style={[s.kindTxt, { color: t.color.ink3 }]}>{kindMeta.label}</Text>
        </View>
        <Text style={s.nfTitle}>Not found</Text>
        <Text style={s.nfMsg}>
          This code doesn't match a document you can access — it may be voided, from another branch, or not yet created.
        </Text>
        <Pressable
          onPress={onRescan}
          accessibilityRole="button"
          accessibilityLabel="Scan again"
          style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.7 }]}
        >
          <RefreshCw size={13} color={t.color.brand} />
          <Text style={s.retryTxt}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Icon size={16} color={t.color.brand} />
        <Text style={s.kindTxt}>{kindMeta.label}</Text>
        {doc.meta.status ? <StatusBadge label={doc.meta.status.replace(/_/g, " ")} tone="neutral" /> : null}
      </View>

      {rows ? (
        <View style={s.metaGrid}>
          {rows.map((r) => (
            <View key={r.label} style={s.metaRow}>
              <Text style={s.metaLabel}>{r.label}</Text>
              <Text style={[s.metaVal, r.mono && s.metaMono]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          WebBrowser.openBrowserAsync(documentWebUrl(doc.kind, doc.id)).catch(() =>
            Toast.show({ type: "error", text1: "Could not open document view" }),
          );
        }}
        accessibilityRole="link"
        accessibilityLabel={`Open ${kindMeta.label} full view`}
        style={({ pressed }) => [s.openBtn, pressed && { opacity: 0.85 }]}
      >
        <ExternalLink size={14} color={t.color.brand} />
        <Text style={s.openTxt}>Open full document</Text>
      </Pressable>
    </View>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: t.color.surface,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: t.color.line,
          padding: tokens.space.md,
          gap: tokens.space.md,
          ...tokens.shadow.card,
        },
        muted: { opacity: 0.9 },
        headRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
        kindTxt: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, flex: 1 },
        metaGrid: { gap: tokens.space.xs },
        metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: tokens.space.sm },
        metaLabel: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
        metaVal: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm, textAlign: "right" },
        metaMono: { fontFamily: tokens.font.mono, fontVariant: ["tabular-nums"] },
        nfTitle: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
        nfMsg: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, lineHeight: 17 },
        retryBtn: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          minHeight: 36,
          paddingHorizontal: tokens.space.md,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: t.color.line,
          backgroundColor: t.color.surface,
        },
        retryTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
        openBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minHeight: 44,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: t.color.line,
          backgroundColor: t.color.fill,
        },
        openTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
      }),
    [t],
  );
};
