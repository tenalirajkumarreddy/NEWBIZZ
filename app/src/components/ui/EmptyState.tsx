import { cn } from "@/lib/cn";

// EmptyState — the calm "nothing here yet" panel for empty tables/lists/errors.
// Provide an optional icon, a title, a one-line description, and an action
// (usually a Button). Use `tone="error"` to signal a failed load vs. no data.
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "error";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full",
          tone === "error" ? "bg-red-wash text-red" : "bg-fill text-ink-4",
        )}
      >
        {icon ?? <DefaultGlyph error={tone === "error"} />}
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[12px] leading-relaxed text-ink-4">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

function DefaultGlyph({ error }: { error?: boolean }) {
  return error ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 8v5m0 3h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M5 12h14M5 17h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
