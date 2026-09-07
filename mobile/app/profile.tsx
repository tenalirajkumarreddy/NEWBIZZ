import { useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { useQuery } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react-native";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

const APP_VERSION = "NEWBIZZ v1.0.0";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, claims, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  const uid = user?.id ?? "";

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = typeof meta.full_name === "string" ? meta.full_name : null;

  const profile = useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, phone")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; full_name: string; phone: string | null } | null;
    },
  });

  const perms = claims.perms;

  function onSignOut() {
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
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not sign out", text2: friendlyError(e) });
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  const name = profile.data?.full_name ?? metaName ?? "Signed-in user";
  const phone = profile.data?.phone ?? (typeof meta.phone === "string" && meta.phone ? meta.phone : null) ?? user?.phone ?? null;

  return (
    <View style={s.root}>
      <GradientHeader
        title="Profile"
        subtitle={roleLabel(claims)}
        right={
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.backTxt}>Done</Text>
          </Pressable>
        }
      />
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, { paddingBottom: 48 + insets.bottom }]}
      >
        <View style={s.userCard}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initialsOf(name)}</Text>
          </View>
          <View style={s.userMain}>
            <Text style={s.userName} numberOfLines={1}>{name}</Text>
            <Text style={s.userPhone}>{phone ?? user?.phone ?? "—"}</Text>
          </View>
          <UserRound size={18} color={tokens.color.ink4} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>ROLES</Text>
          <View style={s.chips}>
            {claims.roles.length === 0 ? (
              <Text style={s.emptyTxt}>No roles assigned</Text>
            ) : (
              claims.roles.map((r) => <StatusBadge key={r} label={r} tone="brand" dot />)
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>PERMISSIONS ({perms.length})</Text>
          <View style={s.chips}>
            {perms.length === 0 ? (
              <Text style={s.emptyTxt}>No extra permissions</Text>
            ) : (
              perms.map((p) => <StatusBadge key={p} label={p} tone="neutral" />)
            )}
          </View>
        </View>

        <Pressable
          onPress={onSignOut}
          disabled={busy}
          accessibilityLabel="Sign out"
          style={({ pressed }) => [s.signOut, (pressed || busy) && { opacity: 0.8 }]}
        >
          <LogOut size={16} color={tokens.color.red} />
          <Text style={s.signOutTxt}>Sign out</Text>
        </Pressable>

        <Text style={s.version}>{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: tokens.space.sm,
    alignItems: "center",
    justifyContent: "center",
    margin: -tokens.space.sm,
  },
  backTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.lg,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.md,
    ...tokens.shadow.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  userMain: { flex: 1, minWidth: 0 },
  userName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.base },
  userPhone: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  section: { gap: tokens.space.sm },
  sectionTitle: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs },
  emptyTxt: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  signOut: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.redWash,
    backgroundColor: tokens.color.redWash,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
  },
  signOutTxt: { color: tokens.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  version: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.eyebrow,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
