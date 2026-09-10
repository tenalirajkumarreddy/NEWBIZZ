"use client";

import { useTheme, type ThemeMode } from "./ThemeProvider";
import { cn } from "@/lib/cn";

// Light / Dark / System segmented picker for the profile page, mirroring the
// mobile app's Appearance row (mobile/app/profile.tsx themeOpts): active option
// gets the cyan brand fill + white text, the rest stay quiet. Icons are the
// lucide Sun / Moon / Monitor glyphs inlined as SVG (lucide-react is not a web
// dependency and none may be added).

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Icon>
  );
}

function MoonIcon() {
  return (
    <Icon>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  );
}

function MonitorIcon() {
  return (
    <Icon>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </Icon>
  );
}

const OPTIONS: { key: ThemeMode; label: string; icon: () => React.ReactNode }[] =
  [
    { key: "system", label: "System", icon: MonitorIcon },
    { key: "light", label: "Light", icon: SunIcon },
    { key: "dark", label: "Dark", icon: MoonIcon },
  ];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-fill p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((o) => {
        const on = theme === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${o.label} theme`}
            onClick={() => setTheme(o.key)}
            className={cn(
              "inline-flex h-8 select-none items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors",
              on ? "bg-brand text-white" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.icon()}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
