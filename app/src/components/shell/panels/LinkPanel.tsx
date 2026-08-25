"use client";

// =====================================================================
// components/shell/panels/LinkPanel.tsx — "Link to existing" side of the
// decide step. Debounced search by the type's natural key (bill no,
// receipt no, party…), tap a hit to bind the file to it.
// =====================================================================

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { searchLinkTargets, type LinkHit, type QuickTypeKey } from "@/lib/actions/quick-attach";

export function LinkPanel({ typeKey, onPicked }: {
  typeKey: QuickTypeKey;
  onPicked: (targetId: string, targetLabel: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LinkHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (typeKey === "plain") return;
    if (q.trim().length < 2) { setHits([]); setError(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchLinkTargets(typeKey, q);
        if (!alive) return;
        if (res.ok) { setHits(res.hits); setError(null); }
        else setError(res.error);
      });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, typeKey]);

  if (typeKey === "plain") return null;

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by number, reference or name…"
        className="h-9 text-[13px]"
      />
      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      {hits.length > 0 && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPicked(h.id, h.title)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-fill"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[13px] font-semibold text-ink">{h.title}</span>
                  {pending && <Badge size="sm">…</Badge>}
                </span>
                {h.subtitle && <span className="block truncate text-[11px] text-ink-4">{h.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !pending && hits.length === 0 && !error && (
        <p className="text-[12px] text-ink-4">No matches — try another number/name, or switch to “Create new”.</p>
      )}
    </div>
  );
}
