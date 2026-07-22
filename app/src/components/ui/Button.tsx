import { forwardRef } from "react";
import { cn } from "@/lib/cn";

// Button — the locked action control. Variants map to the design system:
//   primary   cyan-600 fill (the one accent), for the main action per screen
//   secondary white surface + slate border, for supporting actions
//   ghost     transparent, for tertiary / toolbar actions
//   danger    red fill, for destructive confirms
//   subtle    slate fill, quiet
// Sizes sm (32px) / md (36px, default) / lg (40px). All 8px radius.

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-d active:bg-brand-d disabled:bg-brand/50",
  secondary:
    "bg-white text-ink-2 border border-line hover:border-line-strong hover:bg-fill hover:text-ink",
  ghost: "bg-transparent text-ink-2 hover:bg-fill hover:text-ink",
  danger: "bg-red text-white hover:bg-red/90 active:bg-red/90 disabled:bg-red/50",
  subtle: "bg-fill text-ink-2 hover:bg-line-soft hover:text-ink border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-[7px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-[14px] gap-2 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  /** Icon element rendered before the label. */
  leading?: React.ReactNode;
  /** Icon element rendered after the label. */
  trailing?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    block = false,
    leading,
    trailing,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-70",
        block && "w-full",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && leading}
      {children}
      {!loading && trailing}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
