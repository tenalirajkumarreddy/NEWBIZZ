"use client";

// =====================================================================
// components/shell/GlobalSearch.tsx — ⌘K command palette (F7).
//
// Wired into the topbar search control. Opens on click or Cmd/Ctrl+K,
// queries all core entities via the RLS-scoped server action, groups the
// hits by entity type, and navigates to the result's route on Enter/click.
// Arrow keys move the highlight; Escape closes; an empty/too-short query
// shows the hint state instead of firing a request.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchEverything } from "@/lib/actions/search";
import type { SearchHit, SearchEntity } from "@/lib/data/search";

const GROUP_LABELS: Record<SearchEntity, string> = {
  customer: "Customers",
  store: "Stores",
  order: "Orders",
  invoice: "Invoices",
  receipt: "Receipts",
  item: "Items",
  supplier: "Suppliers",
  challan: "Challans",
};

const GROUP_ORDER: SearchEntity[] = [
  "customer", "store", "supplier", "item", "order", "invoice", "challan", "receipt",
];

const MIN_QUERY = 2;

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Group hits in display order.
  const grouped = useCallback((hs: SearchHit[]) => {
    const order = GROUP_ORDER.filter((e) => hs.some((h) => h.entity === e));
    return order.map((e) => ({ entity: e, items: hs.filter((h) => h.entity === e) }));
  }, []);

  // ⌘K / Ctrl+K opens the palette; Escape closes (handled by overlay blur too).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search once the query is long enough.
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < MIN_QUERY) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchEverything(query);
      setHits(res);
      setActive(0);
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  // Focus the input when opened; scroll the active row into view.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const flat = useCallback(() => hits, [hits]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const h = flat()[active];
      if (h) {
        router.push(h.href);
        setOpen(false);
        setQuery("");
      }
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      {/* Topbar trigger - keeps the exact search-control look from the shell. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-4 flex h-8 max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-line bg-fill px-3 text-left text-[13px] text-ink-4 transition-colors hover:border-line-strong hover:bg-white"
      >
        <SearchGlyph />
        <span className="flex-1 truncate">Search orders, parties, items.</span>
        <kbd className="rounded border border-line bg-white px-1.5 font-mono text-[11px] text-ink-3">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
            {/* Input row */}
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <SearchGlyph />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search customers, stores, orders, invoices, items, suppliers, challans…"
                className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
                aria-label="Global search"
              />
              <kbd className="rounded border border-line bg-white px-1.5 font-mono text-[11px] text-ink-3">Esc</kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-1.5">
              {loading ? (
                <div className="px-4 py-8 text-center text-[12px] text-ink-4">Searching…</div>
              ) : query.trim().length < MIN_QUERY ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-[13px] font-medium text-ink">Type to search</div>
                  <div className="mt-0.5 text-[12px] text-ink-4">
                    Search every customer, store, order, invoice, receipt, item, supplier and challan.
                  </div>
                </div>
              ) : hits.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-ink-4">
                  No matches for “{query.trim()}”.
                </div>
              ) : (
                grouped(hits).map((g) => (
                  <div key={g.entity}>
                    <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-4">
                      {GROUP_LABELS[g.entity]}
                    </div>
                    {g.items.map((h) => {
                      const idx = hits.indexOf(h);
                      const isActive = idx === active;
                      return (
                        <button
                          key={`${h.entity}-${h.id}`}
                          type="button"
                          data-idx={idx}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => {
                            router.push(h.href);
                            close();
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                            isActive ? "bg-brand/10" : "hover:bg-fill"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-brand" : "bg-line-strong"}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">{h.title}</span>
                            {h.subtitle && (
                              <span className="mt-0.5 block truncate text-[11px] text-ink-4">{h.subtitle}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
