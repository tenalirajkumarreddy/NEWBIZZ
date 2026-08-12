"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NotificationsBell } from "./NotificationsBell";
import { GlobalSearch } from "./GlobalSearch";
import type { BranchRow } from "@/lib/data/branches";
import type { FinancialYearRow } from "@/lib/data/types";
import type { FyRow } from "@/lib/data/settings";

// Top bar — reference (refer_UI.html) look with the app's working controls:
//   left   32px cyan square logo + "NEWBIZZ." brand
//   right  ⌘K search, Warehouse + Financial Year selectors, notifications bell,
//          and the user menu behind a 34px cyan rounded-square avatar.
// The Warehouse/FY selectors are live dropdowns fed by the server layout: the
// current branch/FY is marked, every configured warehouse/FY is listed, and the
// warehouse menu offers a settings shortcut to add another.
export function Topbar({
  displayName,
  phone,
  roleLabel,
  warehouses,
  currentWarehouse,
  currentFy,
  financialYears,
  canManageSettings,
}: {
  displayName: string;
  phone: string;
  roleLabel: string;
  warehouses: BranchRow[];
  currentWarehouse: BranchRow | null;
  currentFy: FinancialYearRow | null;
  financialYears: FyRow[];
  canManageSettings: boolean;
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
      <WarehouseSelector
        warehouses={warehouses}
        currentWarehouse={currentWarehouse}
        canManageSettings={canManageSettings}
      />
      <FySelector financialYears={financialYears} currentFy={currentFy} />

      {/* Notifications */}
      <NotificationsBell />

      <UserMenu initials={initials} displayName={displayName} phone={phone} roleLabel={roleLabel} />
    </header>
  );
}

// Warehouse dropdown — shows the active warehouse up front and every warehouse
// in the menu, with the current one marked. Admins get an "Add warehouse"
// shortcut into Company Settings → Branches.
function WarehouseSelector({
  warehouses,
  currentWarehouse,
  canManageSettings,
}: {
  warehouses: BranchRow[];
  currentWarehouse: BranchRow | null;
  canManageSettings: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClose(ref, open, () => setOpen(false));

  const label = currentWarehouse
    ? currentWarehouse.code
      ? `${currentWarehouse.name} · ${currentWarehouse.code}`
      : currentWarehouse.name
    : "No warehouse";

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-left transition-colors hover:border-line-strong"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-4">
          Warehouse
        </span>
        <span className="max-w-[180px] truncate text-[13px] font-semibold text-ink">{label}</span>
        <ChevronGlyph />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink">
            Warehouses
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1">
            {warehouses.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-ink-4">
                No warehouses configured yet.
              </div>
            )}
            {warehouses.map((w) => {
              const current = currentWarehouse?.id === w.id;
              return (
                <div key={w.id} className="flex items-center gap-2 rounded-[7px] px-3 py-2">
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                      current ? "bg-brand text-white" : "bg-fill text-ink-4"
                    }`}
                  >
                    {current ? "✓" : w.code?.slice(0, 1) ?? "•"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${current ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
                      {w.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-4">
                      {w.code}
                      {!w.isPlant ? " · Warehouse" : " · Plant"}
                    </span>
                  </span>
                  {current && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">Active</span>}
                </div>
              );
            })}
          </div>
          {canManageSettings && (
            <div className="border-t border-line p-1">
              <Link
                href="/admin/settings?tab=branches"
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-[12px] font-medium text-brand transition-colors hover:bg-fill"
              >
                <span className="text-[14px] leading-none">＋</span>
                Add warehouse
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Financial Year dropdown — marks the FY the current date falls in and lists
// every configured year (newest first).
function FySelector({
  financialYears,
  currentFy,
}: {
  financialYears: FyRow[];
  currentFy: FinancialYearRow | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClose(ref, open, () => setOpen(false));

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-left transition-colors hover:border-line-strong"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-4">
          FY
        </span>
        <span className="font-mono text-[13px] font-semibold text-ink">
          {currentFy?.code ?? (financialYears[0]?.code ?? "—")}
        </span>
        <ChevronGlyph />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink">
            Financial Years
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1">
            {financialYears.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-ink-4">
                No financial years configured yet.
              </div>
            )}
            {financialYears.map((fy) => {
              const current = currentFy?.id === fy.id;
              return (
                <div key={fy.id} className="flex items-center gap-2 rounded-[7px] px-3 py-2">
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                      current ? "bg-brand text-white" : "bg-fill text-ink-4"
                    }`}
                  >
                    {current ? "✓" : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-mono text-[13px] ${current ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
                      {fy.code}
                    </span>
                    <span className="block truncate text-[11px] text-ink-4">
                      {fy.startDate} → {fy.endDate}
                    </span>
                  </span>
                  {current && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">Current</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Close-on-outside-click / Escape, shared by the topbar dropdowns.
function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, ref]);
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

  useOutsideClose(ref, open, () => setOpen(false));

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
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full rounded-[7px] px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-fill"
            >
              Profile
            </Link>
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