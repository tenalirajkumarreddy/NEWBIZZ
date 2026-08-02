"use client";

import { useEffect, useRef, useState } from "react";
import { NotificationsBell } from "./NotificationsBell";
import { GlobalSearch } from "./GlobalSearch";

// Top bar — reference (refer_UI.html) look with the app's working controls:
//   left   32px cyan square logo + "NEWBIZZ." brand
//   right  ⌘K search, Warehouse + Financial Year selectors, notifications bell,
//          and the user menu behind a 34px cyan rounded-square avatar.
// Sizing/colours/type are taken from the reference (.topbar / .topbar-logo /
// .topbar-user); the selectors are presentational stubs until the warehouse/FY
// context providers land.
export function Topbar({
  displayName,
  phone,
  roleLabel,
  fyLabel = "2026-27",
}: {
  displayName: string;
  phone: string;
  roleLabel: string;
  fyLabel?: string;
}) {
  const initials = deriveInitials(displayName, phone);

  return (
    <header className="flex h-full items-center gap-3 border-b border-line bg-surface px-6">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-mono text-[14px] font-bold text-white">
          N
        </div>
        <div className="text-[16px] font-bold tracking-tight text-ink">
          NEWBIZZ<span className="text-brand">.</span>
        </div>
      </div>

      {/* Search */}
      <GlobalSearch />

      <div className="flex-1" />

      {/* Warehouse + Financial Year selectors */}
      <Selector label="Warehouse" value="Main Plant" />
      <Selector label="FY" value={fyLabel} mono />

      {/* Notifications */}
      <NotificationsBell />

      <UserMenu initials={initials} displayName={displayName} phone={phone} roleLabel={roleLabel} />
    </header>
  );
}

function Selector({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <button
      type="button"
      className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-left transition-colors hover:border-line-strong sm:flex"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-4">
        {label}
      </span>
      <span className={"text-[13px] font-semibold text-ink " + (mono ? "font-mono" : "")}>
        {value}
      </span>
      <ChevronGlyph />
    </button>
  );
}

function UserMenu({
  initials,
  displayName,
  phone,
  roleLabel,
}: {
  initials: string;
  displayName: string;
  phone: string;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-brand font-mono text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="border-b border-line px-4 py-3">
            <div className="text-[13px] font-semibold text-ink">{displayName}</div>
            <div className="mt-0.5 font-mono text-[12px] text-ink-4">{phone}</div>
            <div className="mt-1.5 inline-block rounded border border-line bg-fill px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
              {roleLabel}
            </div>
          </div>
          <div className="p-1">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="w-full rounded-[7px] px-3 py-2 text-left text-[13px] font-medium text-red transition-colors hover:bg-red-wash"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function deriveInitials(name: string, phone: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  // Fall back to the last two phone digits.
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2) || "··";
}

function ChevronGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink-4">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
