import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  const tone =
    pct >= 80 ? "bg-grn" : pct >= 50 ? "bg-amb" : "bg-red";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-fill",
        size === "sm" ? "h-1.5 w-16" : "h-2 w-24",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
