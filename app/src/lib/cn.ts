// Tiny classnames joiner — filters falsy values so conditional classes read
// cleanly (`cn("base", active && "on", disabled && "off")`). No dependency on
// clsx/tailwind-merge to keep the bundle lean; last-wins conflicts are the
// caller's responsibility (order your classes intentionally).
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
