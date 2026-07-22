// Standard money renderer for the whole app.
//
// Why a component and not just a string: JetBrains Mono's ₹ (U+20B9) glyph is
// drawn heavy and oversized — beside 24px mono digits it reads a full step too
// big. So we render the SYMBOL in Inter (the UI sans) at 0.82em and let the
// DIGITS stay in tabular mono. That keeps the numbers monospaced/aligned while
// the rupee sign sits at a natural proportional weight.
//
// Use <Money> anywhere an amount is shown. The digit formatting mirrors
// lib/format.ts exactly (Indian grouping, optional lakh/crore compaction) so
// there is a single source of truth for how money looks.

import { moneyDigits, moneyCompactDigits } from "@/lib/format";

export function Money({
  value,
  compact = false,
  className = "",
}: {
  value: number | string | null | undefined;
  /** Lakh/crore short form for dense metric cards (₹1.84L, ₹6.43Cr). */
  compact?: boolean;
  className?: string;
}) {
  const digits = compact ? moneyCompactDigits(value) : moneyDigits(value);
  if (digits === null) return <span className={className}>—</span>;

  return (
    <span className={"tnum " + className}>
      <Rupee />
      {digits}
    </span>
  );
}

/** The ₹ sign on its own, in Inter at a slightly reduced size. */
export function Rupee() {
  return (
    <span
      className="font-sans"
      style={{ fontSize: "0.82em", fontWeight: 600, marginRight: "0.05em" }}
    >
      ₹
    </span>
  );
}
