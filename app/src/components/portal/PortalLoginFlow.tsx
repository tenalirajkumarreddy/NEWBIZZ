"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

// Portal OTP sign-in. Functionally the same as the internal LoginFlow, but after
// verify it navigates to /portal (the middleware routes a portal principal
// there). Only enabled customer portal numbers can sign in.
export function PortalLoginFlow() {
  const router = useRouter();
  const supabase = createClient();

  const [screen, setScreen] = useState<Screen>("phone");
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verifyingRef = useRef(false);

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
    const { error } = await supabase.auth.signInWithOtp({
      phone: toE164Plus(national, CC),
      options: { shouldCreateUser: false },
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
  }, [national, supabase]);

  const verify = useCallback(
    async (code: string) => {
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
      // If the caller isn't an enabled portal number, the access-token hook will
      // NOT stamp portal_customer_id, and middleware bounces away from /portal.
      router.replace("/portal");
      router.refresh();
    },
    [national, supabase, router],
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
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
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
    <div>
      <div className="mb-8 flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand font-mono text-[16px] font-bold text-white">
          N
        </div>
        <span className="text-[18px] font-bold tracking-tight text-ink">
          NEWBIZZ<span className="text-brand">.</span>
        </span>
      </div>

      {screen === "phone" ? (
        <>
          <p className="eyebrow text-brand">Customer portal</p>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-2 text-[13px] text-ink-3">
            Sign in with the mobile number your distributor has on file.
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
            If you don&apos;t have access yet, ask your contact to enable the portal.
          </p>

          {error && <p className="mt-3 text-[13px] text-red">{error}</p>}

          <button
            onClick={sendCode}
            disabled={busy}
            className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[14px] font-semibold text-white transition-colors hover:bg-brand-d disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send code →"}
          </button>
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
          <h1 className="mt-2 text-[24px] font-bold tracking-tight text-ink">Enter your code</h1>
          <p className="mt-2 text-[13px] text-ink-3">
            Sent to <span className="font-mono text-ink-2">{formatDisplay(national, CC)}</span>
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
                  c ? "border-brand bg-brand-wash" : "border-line focus:border-brand focus:bg-brand-wash"
                }`}
              />
            ))}
          </div>

          <div className="mt-4 text-[13px] text-ink-3">
            Didn&apos;t get it?{" "}
            {resendIn > 0 ? (
              <span className="text-ink-4">Resend in 0:{String(resendIn).padStart(2, "0")}</span>
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
        </>
      )}
    </div>
  );
}