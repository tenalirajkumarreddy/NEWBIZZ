import { cn } from "@/lib/cn";
import { titleCase } from "@/lib/format";

// Badge — compact status/label pill. Tones map to the design-system wash colors.
// The `status` variant looks up a DB enum value and picks the right tone + label,
// so a raw column value (e.g. invoice.status = "part_paid") renders correctly
// without callers hand-mapping colors everywhere.

type Tone = "neutral" | "brand" | "grn" | "amb" | "red" | "slate";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill text-ink-3 ring-1 ring-inset ring-line",
  slate: "bg-slate-100 text-ink-2 ring-1 ring-inset ring-line-strong",
  brand: "bg-brand-wash text-brand-d ring-1 ring-inset ring-brand/20",
  grn: "bg-grn-wash text-grn ring-1 ring-inset ring-grn/20",
  amb: "bg-amb-wash text-amb ring-1 ring-inset ring-amb/20",
  red: "bg-red-wash text-red ring-1 ring-inset ring-red/20",
};

const SIZES = {
  sm: "h-5 px-2 text-[10px] gap-1",
  md: "h-6 px-2.5 text-[11px] gap-1.5",
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: keyof typeof SIZES;
  /** Show a leading dot in the tone color. */
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "md",
  dot,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-semibold",
        SIZES[size],
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-4",
  slate: "bg-ink-3",
  brand: "bg-brand",
  grn: "bg-grn",
  amb: "bg-amb",
  red: "bg-red",
};

// ---- status mapping ---------------------------------------------------------
// One table per DB enum that surfaces in the UI. Keys are the exact DB values.
// Anything not listed falls through to a neutral badge with a title-cased label.

const STATUS_TONE: Record<string, Tone> = {
  // entry_status
  draft: "amb",
  posted: "grn",
  void: "slate",
  // invoice_status  (posted/void shared above)
  paid: "grn",
  part_paid: "amb",
  // order_status  (draft shared)
  confirmed: "brand",
  invoiced: "grn",
  cancelled: "slate",
  fulfilled: "grn",
  partially_fulfilled: "amb",
  // challan_status
  printed: "brand",
  in_transit: "amb",
  delivered: "grn",
  // license_status (common shapes)
  active: "grn",
  expiring: "amb",
  expired: "red",
  pending: "amb",
  suspended: "red",
  // credit_note_status  (draft/posted/cancelled shared above)
  applied: "grn",
  open: "brand",
  approved: "brand",
  // scheme_status (active shared) + scheme_eligibility_status
  closed: "slate",
  disposed: "slate",
  // gst_match_status
  matched: "grn",
  mismatch: "amb",
  missing_in_books: "red",
  missing_in_2b: "amb",
  pending_approval: "amb",
  rejected: "red",
  // notification_severity
  info: "brand",
  success: "grn",
  warning: "amb",
  critical: "red",
  // generic booleans of health
  ok: "grn",
  overdue: "red",
  disabled: "slate",
};

export interface StatusBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  /** Raw DB enum value, e.g. invoice.status. */
  status: string | null | undefined;
  /** Override the auto label (defaults to Title Case of the value). */
  label?: string;
}

/** Renders a Badge whose tone + label are derived from a DB enum value. */
export function StatusBadge({ status, label, dot = true, ...rest }: StatusBadgeProps) {
  const key = (status ?? "").toLowerCase();
  const tone = STATUS_TONE[key] ?? "neutral";
  return (
    <Badge tone={tone} dot={dot} {...rest}>
      {label ?? (status ? titleCase(status) : "—")}
    </Badge>
  );
}
