"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { id: "dashboard", label: "Attendance Dashboard" },
  { id: "workers", label: "Workers" },
  { id: "settings", label: "Settings" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function Tabs({ active }: { active: TabId }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onSelect(id: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", id);
    router.replace(`/payroll?${p.toString()}`);
  }

  return (
    <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
            active === t.id
              ? "text-ink after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-brand"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
