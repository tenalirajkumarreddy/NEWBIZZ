import { cn } from "@/lib/cn";

// Toggle — an accessible switch. The only accent (brand) fill is reserved for
// the ON state; OFF renders a neutral track so rows read cleanly in lists.
//
//   <Toggle checked={on} onCheckedChange={setOn} disabled={!isAdmin} />
//
// Keyboard: space/enter toggle while focused. Screen readers hear the label via
// aria-label (or an adjacent <label> wiring the wrapping button's aria-labelledby).

const SIZES = {
  sm: { track: "h-5 w-8", knob: "h-4 w-4", on: "translate-x-3", off: "translate-x-0.5" },
  md: { track: "h-6 w-10", knob: "h-5 w-5", on: "translate-x-[18px]", off: "translate-x-0.5" },
} as const;

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: keyof typeof SIZES;
  /** Accessible name for the switch (required when no visible label wraps it). */
  "aria-label"?: string;
  className?: string;
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled = false,
  size = "md",
  className,
  ...rest
}: ToggleProps) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1",
        s.track,
        checked ? "bg-brand" : "bg-line-strong",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow-sm transition-transform duration-150",
          s.knob,
          checked ? s.on : s.off,
        )}
      />
    </button>
  );
}
