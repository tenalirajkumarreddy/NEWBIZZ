import { useState, useMemo } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  Bell, ChevronRight, ClipboardCheck, LogOut, QrCode, UserRound,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { PressCard } from "@/components/PressCard";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { gotoTab } from "@/lib/tabBus";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

interface MoreRow {
  key: string;
  icon: LucideIcon;
  label: string;
  sub: string;
  danger?: boolean;
  onPress: () => void;
}

export default function MoreScreen() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const { claims, can, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  function confirmSignOut() {
    Alert.alert("Sign out", "Sign out of NEWBIZZ on this device?", [
      { text: "Stay", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (busy) return;
            setBusy(true);
            try {
              await signOut();
              router.replace("/");
            } catch {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  const rows: MoreRow[] = [
    {
      key: "approvals",
      icon: ClipboardCheck,
      label: "Approvals",
      sub: "Orders and requests waiting on you",
      onPress: () => gotoTab("approvals"),
    },
    ...(can("customer.manage")
      ? [
          {
            key: "store-qr",
            icon: QrCode,
            label: "Store QRs",
            sub: "Generate and link counter codes",
            onPress: () => router.push("/more/store-qr"),
          },
        ]
      : []),
    {
      key: "notifications",
      icon: Bell,
      label: "Notifications",
      sub: "Alerts and updates",
      onPress: () => router.push("/notifications"),
    },
    {
      key: "profile",
      icon: UserRound,
      label: "Profile",
      sub: "Your account and permissions",
      onPress: () => router.push("/profile"),
    },
    {
      key: "signout",
      icon: LogOut,
      label: "Sign out",
      sub: "End this session",
      danger: true,
      onPress: confirmSignOut,
    },
  ];

  return (
    <Screen>
      <GradientHeader title="More" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {rows.map((r) => {
          const fg = r.danger ? t.color.red : t.color.brand;
          const wash = r.danger ? t.color.redWash : t.color.brandWash;
          return (
            <PressCard key={r.key} onPress={r.onPress} style={s.rowCard}>
              <View style={s.row}>
                <View style={[s.chip, { backgroundColor: wash }]}>
                  <r.icon size={16} color={fg} />
                </View>
                <View style={s.main}>
                  <Text style={[s.label, r.danger && { color: t.color.red }]}>{r.label}</Text>
                  <Text style={s.sub}>{r.sub}</Text>
                </View>
                {r.danger ? null : <ChevronRight size={16} color={t.color.ink4} />}
              </View>
            </PressCard>
          );
        })}
      </View>
    </Screen>
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
    gap: tokens.space.sm,
  },
  rowCard: { minHeight: 64 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    padding: tokens.space.md,
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0 },
  label: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
});
  }, [palette]);
};
