import Link from "next/link";
import { cn } from "@/lib/cn";

// Shared page chrome. Every (app) page previously copy-pasted its own wrapper
// (`mx-auto max-w-[Xpx] flex-col gap-4 px-6 py-6 lg:px-8`) and its own
// `text-[22px] font-bold` h1 header. These two components centralise that so
// layout width and header structure stay consistent across all modules and
// can't drift page-by-page.

// Named width tokens — a named ladder instead of raw px values sprayed across
// the codebase. Registers/desks default to the widest; reports, details and
// forms step down as appropriate.
export const PAGE_WIDTH = {
  full: "max-w-[1440px]", // registers, desks, admin
  wide: "max-w-[1200px]", // wide detail sections
  report: "max-w-[1100px]", // financials / reports / trial balance
  detail: "max-w-[1000px]", // detail pages
  form: "max-w-[900px]", // create/edit pages
  formSm: "max-w-[700px]", // settings / compact forms
  narrow: "max-w-[600px]", // tiny single-field forms
} as const;

export type PageWidth = keyof typeof PAGE_WIDTH;

// PageContainer — the standard content wrapper for every page inside the shell.
// Set a named `width` (defaults to `full` for registers). Extends the page via
// `className` and `...rest`.
export function PageContainer({
  width = "full",
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { width?: PageWidth }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4 px-6 py-6 lg:px-8",
        PAGE_WIDTH[width],
        className,
      )}
      {...rest}
    />
  );
}

// PageHeader — the page-title block: optional back link, an h1 (optionally
// mono for document numbers), a subtitle, and trailing actions on the right.
export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
  mono = false,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
  /** Render an "← label" back link above the title. */
  backHref?: string;
  backLabel?: string;
  /** Render the title in mono (document/account numbers). */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← {backLabel}
          </Link>
        )}
        <h1
          className={cn(
            "text-[22px] font-bold tracking-tight text-ink",
            backHref && "mt-1",
            mono && "font-mono",
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}