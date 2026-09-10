"use client";

// =====================================================================
// components/shell/panels/MiniPicker.tsx — tiny async combobox for the
// quick-attach create forms. Loads options via a server action as the
// user types; picks one; clears on ✕. Deliberately minimal: no keyboard
// nav beyond Escape-close (forms are short; power users have the full
// module pages).
// =====================================================================

import { useEffect, useRef, useState } from "react";
import type { PickerOption } from "@/lib/actions/quick-attach";

export function MiniPicker({
  label, load, value, onSelect, placeholder,
}: {
  label: string;
  load: (q: string) => Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
  value: PickerOption | null;
  onSelect: (o: PickerOption | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<PickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const res = await load(q);
      if (alive) { setOpts(res.options ?? []); setBusy(false); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-4">{label}</span>
      {value ? (
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-white dark:bg-fill px-2.5">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">
            {value.label}{value.sub ? <span className="text-ink-4"> · {value.sub}</span> : null}
          </span>
          <button type="button" onClick={() => onSelect(null)} className="text-[12px] text-ink-4 hover:text-red">✕</button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            placeholder={placeholder ?? "Search…"}
            className="h-9 w-full rounded-lg border border-line bg-white dark:bg-fill px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
          {open && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface shadow-pop">
              {busy && <div className="px-3 py-2 text-[12px] text-ink-4">Searching…</div>}
              {!busy && opts.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-4">No matches.</div>}
              {opts.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onSelect(o); setOpen(false); setQ(""); }}
                  className="block w-full px-3 py-2 text-left hover:bg-fill"
                >
                  <span className="block truncate text-[13px] font-medium text-ink">{o.label}</span>
                  {o.sub && <span className="block truncate text-[11px] text-ink-4">{o.sub}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
