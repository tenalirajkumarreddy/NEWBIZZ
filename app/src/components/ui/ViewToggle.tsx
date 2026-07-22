"use client";

export type ViewMode = "table" | "cards";

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
          value === "table"
            ? "bg-fill text-ink shadow-sm"
            : "text-ink-4 hover:text-ink"
        }`}
        aria-label="Table view"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
          value === "cards"
            ? "bg-fill text-ink shadow-sm"
            : "text-ink-4 hover:text-ink"
        }`}
        aria-label="Cards view"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Cards
      </button>
    </div>
  );
}
