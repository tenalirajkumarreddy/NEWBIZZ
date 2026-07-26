"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/crm", label: "Leads" },
  { href: "/crm/follow-ups", label: "Follow-ups" },
  { href: "/crm/complaints", label: "Complaints" },
  { href: "/crm/campaigns", label: "Campaigns" },
] as const;

export function CrmTabNav() {
  const pathname = usePathname();

  return (
    <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
