"use client";

// Staggered-entry wrapper for the metric row. Each card animates in
// sequentially using a CSS cascade delay, giving the dashboard a "live
// telemetry coming online" feel without Framer Motion overhead.
// VISUAL_DENSITY 4 keeps this subtle — a quick 100ms stagger per card.

export function DashboardMetrics({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  delta,
  tone,
  bar,
}: {
  label: string;
  value: React.ReactNode;
  delta: string;
  tone: "grn" | "amb" | "brand" | "red" | "muted";
  bar?: number;
}) {
  const deltaClass = {
    grn: "text-grn",
    amb: "text-amb",
    brand: "text-brand",
    red: "text-red",
    muted: "text-ink-4",
  }[tone];

  const fillClass = {
    grn: "bg-grn",
    amb: "bg-amb",
    brand: "bg-brand",
    red: "bg-red",
    muted: "bg-line-strong",
  }[tone];

  return (
    <div
      className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-card transition-all duration-150 ease-out hover:shadow-pop active:scale-[0.98]"
      style={{ animation: "nb-pop 0.16s cubic-bezier(0.16,1,0.3,1) both" }}
    >
      <div className="eyebrow text-ink-4">{label}</div>
      <div className="mt-2 font-mono text-[24px] font-bold leading-none tracking-tight text-ink tnum">
        {value}
      </div>
      <div className={"mt-2 text-[12px] font-medium " + deltaClass}>{delta}</div>
      <div className="mt-3 h-[3px] overflow-hidden rounded bg-line">
        {typeof bar === "number" && bar > 0 && (
          <div
            className={"h-full rounded transition-all " + fillClass}
            style={{ width: `${bar}%` }}
          />
        )}
      </div>
    </div>
  );
}
