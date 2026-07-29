"use client";

import { useRouter, useSearchParams } from "next/navigation";

function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const value = `${yr}-${mo}-01`;
    const label = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "long",
      year: "numeric",
    }).format(d);
    options.push({ value, label });
  }
  return options;
}

export function MonthPicker({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const options = monthOptions();

  function onChange(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", val);
    router.replace(`/payroll?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
