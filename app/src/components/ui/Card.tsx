import { cn } from "@/lib/cn";

// Card — the base surface: white, hairline border, soft card shadow, 12px radius.
export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface shadow-card", className)}
      {...rest}
    />
  );
}

// Panel — a Card with a titled header row and a body. `actions` sit on the right
// of the header (buttons, filters). `flush` removes body padding (for tables).
export interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  flush?: boolean;
  bodyClassName?: string;
}

export function Panel({
  title,
  subtitle,
  actions,
  flush,
  bodyClassName,
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <Card className={cn("flex flex-col", className)} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-ink-4">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

// SectionHeading — an eyebrow + optional trailing content, for grouping inside a page.
export function SectionHeading({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="eyebrow text-ink-4">{children}</div>
      {trailing}
    </div>
  );
}
