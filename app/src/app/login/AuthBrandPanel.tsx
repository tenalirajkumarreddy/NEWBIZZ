// Shared dark "command panel" for the auth split-screen (left column).
// Hidden below 820px per the locked prototype.
import { Rupee } from "@/components/ui/Money";

export function AuthBrandPanel() {
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden p-14 text-white md:flex"
      style={{
        background:
          "linear-gradient(155deg,#0f172a 0%,#0e4b5a 55%,#0891b2 130%)",
      }}
    >
      {/* subtle dotted overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative flex items-center gap-3">
        <div className="grid h-[38px] w-[38px] place-items-center rounded-lg bg-brand font-mono text-lg font-bold text-white">
          N
        </div>
        <span className="text-[19px] font-bold tracking-tight">
          NEWBIZZ<span style={{ color: "#5fd0e6" }}>.</span>
        </span>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-[30px] font-bold leading-tight tracking-tight">
          Run the plant, the routes, and the books from one place.
        </h2>
        <p className="mt-4 text-[15px]" style={{ color: "#cbe7ee" }}>
          One operational source of truth for manufacturing, distribution, and
          accounting — every case filled and every rupee reconciled.
        </p>
        <div className="mt-8 flex gap-8">
          {[
            { v: <><Rupee />1.84L</>, l: "Sales today" },
            { v: "847", l: "Cases filled" },
            { v: "0", l: "Unreconciled" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-[22px] font-bold tabular-nums">
                {s.v}
              </div>
              <div
                className="mt-1 text-[11px] uppercase tracking-wide"
                style={{ color: "#9fd3de" }}
              >
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="relative font-mono text-[11px]"
        style={{ color: "#7fbecb" }}
      >
        FY 2026-27 · Asia/Kolkata · Secured by phone OTP
      </div>
    </div>
  );
}
