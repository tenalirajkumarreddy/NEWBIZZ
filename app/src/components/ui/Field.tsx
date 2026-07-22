import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

// Field — label + control + hint/error wrapper. Wrap any input-like control:
//   <Field label="GSTIN" hint="15 characters" error={errors.gstin}>
//     <Input ... />
//   </Field>
// It threads an id to the control via the label's htmlFor when given `htmlFor`.
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[12px] font-semibold text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-red">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-red">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-ink-4">{hint}</p>
      ) : null}
    </div>
  );
}

// Shared control chrome so Input / Select / Textarea look identical.
export const controlBase =
  "w-full rounded-lg border bg-white text-[13px] text-ink placeholder:text-ink-4 " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand " +
  "disabled:cursor-not-allowed disabled:bg-fill disabled:text-ink-4";

function stateBorder(invalid?: boolean): string {
  return invalid ? "border-red focus:border-red focus:ring-red/25" : "border-line";
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Monospace the value — use for numbers, codes, GSTIN, phone. */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, mono, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(controlBase, stateBorder(invalid), "h-9 px-3", mono && "font-mono tnum", className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlBase, stateBorder(invalid), "px-3 py-2 leading-relaxed", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        controlBase,
        stateBorder(invalid),
        "h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9",
        // inline chevron so we don't ship an icon font
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m4 6 4 4 4-4%22/></svg>')]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Convenience: a Field that auto-generates and wires an id to a single Input. */
export function LabeledInput({
  label,
  hint,
  error,
  required,
  className,
  ...input
}: FieldProps & InputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Input id={id} invalid={!!error} {...input} />
    </Field>
  );
}
