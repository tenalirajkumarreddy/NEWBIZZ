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
import Svg, { Path, Rect } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { googleSignIn } from "@/data/googleAuth";
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
  const [googleBusy, setGoogleBusy] = useState(false);

  const e164 = `+91${phone}`;
  const busy = sending || verifying || googleBusy;

  async function googleSignInFlow() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const res = await googleSignIn();
      if (res.ok) {
        router.replace("/(tabs)/home");
        return;
      }
      if (res.orphan) {
        Toast.show({
          type: "info",
          text1: "Google email not linked",
          text2: "Log in with your phone number, then link Google from your profile.",
        });
      } else if (res.error) {
        Toast.show({ type: "error", text1: "Google sign-in failed", text2: res.error });
      }
    } finally {
      setGoogleBusy(false);
    }
  }

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
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerTxt}>OR</Text>
          <View style={s.dividerLine} />
        </View>
        <Pressable
          onPress={() => void googleSignInFlow()}
          disabled={busy}
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => [s.googleBtn, (pressed || busy) && { opacity: 0.85 }]}
        >
          <GoogleGlyph />
          <Text style={s.googleTxt}>Continue with Google</Text>
        </Pressable>
        <Text style={s.googleHint}>Google works only after you link it from your profile.</Text>
      </KeyboardAvoidingView>
    </ScrollView>
  );
}

function GoogleGlyph() {
  const { palette: t } = useTheme();
  return (
    <Svg width={16} height={16} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.96 13.22l7.38 5.73C12.13 13.15 17.6 9.5 24 9.5z"
      />
      <Rect width={0} height={0} fill={t.color.surface} />
    </Svg>
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
  dividerRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(148,163,184,0.25)" },
  dividerTxt: { color: "rgba(148,163,184,0.7)", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  googleBtn: {
    alignSelf: "stretch",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(148,163,184,0.08)",
    marginTop: tokens.space.sm,
  },
  googleTxt: { color: "rgba(148,163,184,0.95)", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  googleHint: {
    alignSelf: "stretch",
    color: "rgba(148,163,184,0.6)",
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    textAlign: "center",
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
