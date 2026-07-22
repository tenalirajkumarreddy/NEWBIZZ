"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  digitsOnly,
  isValidNationalMobile,
  toE164Plus,
  formatDisplay,
} from "@/lib/auth/phone";

const CC = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "91";
const RESEND_SECONDS = 28;

type Screen = "phone" | "otp";

export function LoginFlow() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";
  const supabase = createClient();

  const [screen, setScreen] = useState<Screen>("phone");
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verifyingRef = useRef(false);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = useCallback(async () => {
    setError(null);
    if (!isValidNationalMobile(national)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    // signInWithOtp wants E.164 WITH '+'. Supabase stores it without '+' — the
    // invitation/trigger matching handles that side (see lib/auth/phone.ts).
    // Normally invitation-only: login never self-creates an auth user
    // (admins provision people). The one exception is first-run bootstrap:
    // set NEXT_PUBLIC_ALLOW_SELF_SIGNUP=true in .env.local, log in once to
    // become the bootstrap admin (first user → admin), then remove the flag.
    const allowSelfSignup =
      process.env.NEXT_PUBLIC_ALLOW_SELF_SIGNUP === "true";
    const { error } = await supabase.auth.signInWithOtp({
      phone: toE164Plus(national, CC),
      options: { shouldCreateUser: allowSelfSignup },
    });
    setBusy(false);
    if (error) {
      setError(error.message || "Could not send the code. Try again.");
      return;
    }
    verifyingRef.current = false;
    setOtp(Array(6).fill(""));
    setScreen("otp");
    setResendIn(RESEND_SECONDS);
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  }, [national, supabase, CC]);

  const verify = useCallback(
    async (code: string) => {
      // Guard against double-submit: the OTP inputs auto-fire verify on the
      // 6th digit AND the button calls it — two requests would race, the second
      // hitting an already-consumed token and leaving the spinner stuck.
      if (verifyingRef.current) return;
      if (code.length !== 6) return;
      verifyingRef.current = true;
      setError(null);
      setBusy(true);
      const { error } = await supabase.auth.verifyOtp({
        phone: toE164Plus(national, CC),
        token: code,
        type: "sms",
      });
      if (error) {
        verifyingRef.current = false;
        setBusy(false);
        setError(error.message || "Invalid or expired code.");
        setOtp(Array(6).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      // Session cookie is set; middleware routes based on user_status.
      // Keep busy=true through navigation so the form can't re-fire.
      router.replace(nextPath);
      router.refresh();
    },
    [national, supabase, router, nextPath, CC],
  );

  const onOtpChange = (i: number, v: string) => {
    const d = digitsOnly(v).slice(-1);
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((c) => c !== "")) verify(next.join(""));
  };

  const onOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const onOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = digitsOnly(e.clipboardData.getData("text")).slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(next);
    if (pasted.length === 6) verify(pasted);
    else otpRefs.current[pasted.length]?.focus();
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-10">
      <div className="w-full max-w-[380px]">
        {screen === "phone" ? (
          <>
            <p className="eyebrow text-brand">Sign in</p>
            <h1 className="mt-2 text-[24px] font-bold tracking-tight text-ink">
              Welcome back
            </h1>
            <p className="mt-2 text-[13px] text-ink-3">
              We&apos;ll text a one-time code to your registered mobile number.
            </p>

            <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Mobile number
            </label>
            <div className="mt-2 flex items-stretch overflow-hidden rounded-[9px] border border-line focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tw-shadow-color)] focus-within:shadow-brand-wash">
              <span className="flex items-center border-r border-line bg-fill px-3 font-mono text-[14px] text-ink-2">
                +{CC}
              </span>
              <input
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={national}
                onChange={(e) => setNational(digitsOnly(e.target.value).slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="90000 00001"
                className="w-full bg-white px-3 py-3 font-mono text-[15px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>
            <p className="mt-2 text-[12px] text-ink-4">
              Only registered numbers can sign in. Ask an admin for an invite.
            </p>

            {error && <p className="mt-3 text-[13px] text-red">{error}</p>}

            <button
              onClick={sendCode}
              disabled={busy}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[14px] font-semibold text-white transition-colors hover:bg-brand-d disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code →"}
            </button>

            <div className="my-5 flex items-center gap-3 text-[12px] text-ink-4">
              <span className="h-px flex-1 bg-line" /> or{" "}
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={async () => {
                setError(null);
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: `${window.location.origin}/auth/callback` },
                });
                if (error) setError(error.message);
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-[14px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:bg-fill"
            >
              <GoogleGlyph /> Continue with Google
            </button>
            <p className="mt-3 text-[12px] text-ink-4">
              Google works only after you link it from Settings.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setScreen("phone");
                setError(null);
              }}
              className="text-[13px] text-brand hover:text-brand-d"
            >
              ← Change number
            </button>
            <p className="eyebrow mt-4 text-brand">Verify</p>
            <h1 className="mt-2 text-[24px] font-bold tracking-tight text-ink">
              Enter your code
            </h1>
            <p className="mt-2 text-[13px] text-ink-3">
              Sent to{" "}
              <span className="font-mono text-ink-2">{formatDisplay(national, CC)}</span>
            </p>

            <div className="mt-6 flex gap-[9px]" onPaste={onOtpPaste}>
              {otp.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  value={c}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => onOtpKeyDown(i, e)}
                  className={`h-[52px] w-full rounded-[9px] border text-center font-mono text-[20px] font-bold text-ink outline-none transition-colors ${
                    c
                      ? "border-brand bg-brand-wash"
                      : "border-line focus:border-brand focus:bg-brand-wash"
                  }`}
                />
              ))}
            </div>

            <div className="mt-4 text-[13px] text-ink-3">
              Didn&apos;t get it?{" "}
              {resendIn > 0 ? (
                <span className="text-ink-4">
                  Resend in 0:{String(resendIn).padStart(2, "0")}
                </span>
              ) : (
                <button onClick={sendCode} className="text-brand hover:text-brand-d">
                  Resend code
                </button>
              )}
            </div>

            {error && <p className="mt-3 text-[13px] text-red">{error}</p>}

            <button
              onClick={() => verify(otp.join(""))}
              disabled={busy || otp.some((c) => !c)}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[14px] font-semibold text-white transition-colors hover:bg-brand-d disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
            <p className="mt-3 text-[12px] text-ink-4">
              If the code doesn&apos;t arrive, the SMS gateway may be offline — ask
              an admin.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
