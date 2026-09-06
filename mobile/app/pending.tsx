import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Lock } from "lucide-react-native";
import { useSession } from "@/lib/session";
import { tokens } from "@/theme/tokens";

export default function Pending() {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    await signOut();
  }

  return (
    <View style={s.root}>
      <View style={s.circle}>
        <Lock size={40} color={tokens.color.ink4} />
      </View>
      <Text style={s.title}>Account pending approval</Text>
      <Text style={s.msg}>
        Your account is waiting for an administrator to approve access.
      </Text>
      <Pressable
        onPress={onSignOut}
        disabled={busy}
        style={({ pressed }) => [s.btn, (pressed || busy) && { opacity: 0.7 }]}
      >
        {busy ? (
          <ActivityIndicator color={tokens.color.ink2} />
        ) : (
          <Text style={s.btnTxt}>Sign out</Text>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space.xl,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: tokens.color.ink,
    fontFamily: tokens.font.sansBold,
    fontSize: tokens.size.lg,
    marginTop: tokens.space.lg,
    textAlign: "center",
  },
  msg: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.sm,
    lineHeight: 20,
    marginTop: tokens.space.sm,
    textAlign: "center",
    maxWidth: 280,
  },
  btn: {
    alignSelf: "stretch",
    maxWidth: 280,
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.xl,
  },
  btnTxt: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
  },
});
