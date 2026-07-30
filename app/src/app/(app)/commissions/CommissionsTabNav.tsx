"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/commissions", label: "Achievement" },
  { href: "/commissions/runs", label: "Commission Runs" },
  { href: "/commissions/rules", label: "Commission Rules" },
  { href: "/commissions/targets", label: "Monthly Targets" },
] as const;

export function CommissionsTabNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const params = new URLSearchParams(searchParams.toString());
        const href = tab.href + (params.toString() ? `?${params.toString()}` : "");
        return (
          <Link
            key={tab.href}
            href={href}
            className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? "text-ink after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-brand"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
