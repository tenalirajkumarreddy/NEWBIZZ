"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import type { AppClaims } from "@/lib/auth/claims";
import { can } from "@/lib/auth/claims";

// Grouped left rail. Items the user's claims can't satisfy are dropped, and any
// group left with no visible items is hidden entirely. Active item gets the
// cyan wash + left border treatment from the locked design system.
//
// Badge counts are optional live signals; until wired they stay undefined and
// simply don't render.
export function Sidebar({
  claims,
  badges = {},
}: {
  claims: AppClaims;
  badges?: Record<string, number | undefined>;
}) {
  const pathname = usePathname();
  // The row the user just clicked, cleared when the route lands (or on a
  // same-route no-op). Gives instant "I heard you" feedback — the row shows a
  // spinner and lights up in its pending colour before the new page paints.
  const [clicked, setClicked] = useState<string | null>(null);
  useEffect(() => setClicked(null), [pathname]);

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((it) => {
      if (it.roles) return claims.is_admin || claims.roles.some((r) => it.roles!.includes(r));
      if (it.anyOf) return it.anyOf.some((p) => can(claims, p));
      if (it.perm) return can(claims, it.perm);
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="flex h-full flex-col overflow-y-auto border-r border-line bg-surface py-3">
      {groups.map((group) => (
        <div key={group.label} className="mb-1">
          <div className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-4">
            {group.label}
          </div>
          <ul>
            {group.items.map((it) => {
              // Exact match for "/", prefix match for the rest, so
              // /orders/123 keeps "Order Book" lit.
              const active =
                it.href === "/"
                  ? pathname === "/"
                  : pathname === it.href || pathname.startsWith(it.href + "/");
              const badge = it.badgeKey ? badges[it.badgeKey] : undefined;

              const pending = clicked === it.href && !active;

              return (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    onClick={() => setClicked(it.href)}
                    className={
                      "flex items-center gap-2.5 border-l-2 px-5 py-[7px] text-[13px] font-medium transition-colors " +
                      (active
                        ? "border-brand bg-brand-wash text-brand"
                        : pending
                          ? "border-brand bg-fill text-brand"
                          : "border-transparent text-ink-2 hover:bg-fill hover:text-brand")
                    }
                  >
                    {pending ? (
                      <svg
                        className="h-2.5 w-2.5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <span
                        className={
                          "text-[10px] leading-none " + (active ? "text-brand" : "text-ink-4")
                        }
                        aria-hidden
                      >
                        ■
                      </span>
                    )}
                    <span className="flex-1 truncate">{it.label}</span>
                    {typeof badge === "number" && badge > 0 && (
                      <span
                        className={
                          "min-w-[18px] rounded-full px-1.5 text-center text-[10px] font-semibold leading-[16px] " +
                          (active ? "bg-brand-wash text-brand" : "bg-fill text-ink-3")
                        }
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
