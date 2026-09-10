import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import Toast from "react-native-toast-message";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export default function Login() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const e164 = `+91${phone}`;
  const busy = sending || verifying;

  async function sendOtp() {
    if (phone.length !== 10 || busy) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      setStage("otp");
      Toast.show({ type: "success", text1: "OTP sent" });
    } catch (e) {
      Toast.show({ type: "error", text1: friendlyError(e) });
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6 || busy) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: "sms" });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      Toast.show({ type: "error", text1: friendlyError(e) });
      setVerifying(false);
    }
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      keyboardShouldPersistTaps="handled"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.logo}>
          <Text style={s.logoTxt}>N</Text>
        </View>
        <Text style={s.title}>NEWBIZZ</Text>
        <Text style={s.subtitle}>Business Management</Text>

        {stage === "phone" ? (
          <>
            <View style={s.phoneRow}>
              <Text style={s.prefix}>+91</Text>
              <View style={s.divider} />
              <TextInput
                style={s.phoneInput}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="9876543210"
                placeholderTextColor={t.color.ink4}
                maxLength={10}
                autoFocus
              />
            </View>
            <Pressable
              onPress={sendOtp}
              disabled={phone.length !== 10 || busy}
              style={({ pressed }) => [
                s.primaryBtn,
                (pressed || phone.length !== 10 || busy) && s.primaryBtnDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={t.color.surface} />
              ) : (
                <Text style={s.primaryTxt}>Send OTP</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.otpLabel}>Enter the 6-digit code sent to {e164}</Text>
            <TextInput
              style={s.otpInput}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              placeholder="······"
              placeholderTextColor={t.color.ink4}
              maxLength={6}
              autoFocus
            />
            <Pressable
              onPress={verifyOtp}
              disabled={otp.length !== 6 || busy}
              style={({ pressed }) => [
                s.primaryBtn,
                (pressed || otp.length !== 6 || busy) && s.primaryBtnDisabled,
              ]}
            >
              {verifying ? (
                <ActivityIndicator color={t.color.surface} />
              ) : (
                <Text style={s.primaryTxt}>Verify</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setOtp("");
                setStage("phone");
              }}
              disabled={busy}
              style={({ pressed }) => [s.ghostBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.ghostTxt}>Change number</Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </ScrollView>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  scroll: { flex: 1, backgroundColor: t.color.bg },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space.xl,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.lg,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.space.lg,
  },
  logoTxt: {
    color: t.color.surface,
    fontFamily: tokens.font.sansBold,
    fontSize: tokens.size.xxl,
  },
  title: {
    color: t.color.ink,
    fontFamily: tokens.font.sansBold,
    fontSize: tokens.size.xxl,
  },
  subtitle: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.sm,
    marginTop: tokens.space.xs,
    marginBottom: tokens.space.xxl,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    height: 52,
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    paddingHorizontal: tokens.space.md,
  },
  prefix: {
    color: t.color.ink2,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.base,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: t.color.line,
    marginHorizontal: tokens.space.md,
  },
  phoneInput: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.base,
    padding: 0,
  },
  otpLabel: {
    color: t.color.ink2,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.sm,
    textAlign: "center",
    marginBottom: tokens.space.md,
  },
  otpInput: {
    alignSelf: "stretch",
    height: 56,
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xl,
    letterSpacing: 8,
    textAlign: "center",
    paddingHorizontal: tokens.space.md,
    marginBottom: tokens.space.lg,
  },
  primaryBtn: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.lg,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryTxt: {
    color: t.color.surface,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.base,
  },
  ghostBtn: {
    alignSelf: "stretch",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.sm,
  },
  ghostTxt: {
    color: t.color.brand,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
  },
});
  }, [palette]);
};
