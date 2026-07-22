import { Card } from "@/components/ui/Card";

// Kpi — stat card for register headers. Same look as the Sales Desk strip:
// eyebrow label, big mono number, quiet sub-line. Tone colors the value only.
export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "amb" | "grn";
}) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div
        className={
          "mt-1 font-mono text-[20px] font-bold tracking-tight tnum " +
          (tone === "amb" ? "text-amb" : tone === "grn" ? "text-grn" : "text-ink")
        }
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-4">{sub}</div>}
    </Card>
  );
}
