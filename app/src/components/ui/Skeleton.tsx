import { cn } from "@/lib/cn";

// Skeleton — a shimmering placeholder block for loading states. Size it with
// width/height utility classes: <Skeleton className="h-4 w-32" />.
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-line/70", className)}
      {...rest}
    />
  );
}

/** A stack of skeleton lines, the last one shorter — for text placeholders. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Skeleton table body — `rows` × `cols` of shimmer cells, matching Table chrome. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton className={cn("h-3.5", c === 0 ? "w-32" : "w-16", c > 0 && "ml-auto")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
