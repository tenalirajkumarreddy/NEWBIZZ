import type { Config } from "tailwindcss";

// Locked NEWBIZZ design system (see docs/superpowers/prototypes/newbizz-app-prototype.html).
// "Light tactical operations console": slate-on-white with a single cyan-600 accent,
// JetBrains Mono for every number. Hex values are copied verbatim from the prototype's
// :root block so the React build is pixel-faithful.
//
// Dark mode (class strategy, `dark` on <html>): every token below resolves to a CSS
// variable defined in globals.css (:root = light values verbatim, .dark = deep
// slate-navy palette matching the mobile app). Classes like `bg-surface` / `text-ink`
// therefore flip everywhere at once; alpha modifiers (/50, /30) keep working via
// <alpha-value>.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--nb-bg) / <alpha-value>)", // --bg   slate-100 app background
        surface: "rgb(var(--nb-surface) / <alpha-value>)", // --surface
        line: "rgb(var(--nb-line) / <alpha-value>)", // --line  slate-200 border
        "line-soft": "rgb(var(--nb-line-soft) / <alpha-value>)", // --line-soft
        ink: "rgb(var(--nb-ink) / <alpha-value>)", // --ink   slate-900 primary text
        "ink-2": "rgb(var(--nb-ink-2) / <alpha-value>)", // --ink-2 slate-600
        "ink-3": "rgb(var(--nb-ink-3) / <alpha-value>)", // --ink-3 slate-500
        "ink-4": "rgb(var(--nb-ink-4) / <alpha-value>)", // --ink-4 slate-400
        brand: "rgb(var(--nb-brand) / <alpha-value>)", // --brand cyan-600 accent
        "brand-d": "rgb(var(--nb-brand-d) / <alpha-value>)", // --brand-d cyan-700
        "brand-wash": "rgb(var(--nb-brand-wash) / <alpha-value>)", // --brand-wash cyan-50
        grn: "rgb(var(--nb-grn) / <alpha-value>)", // --grn emerald-600
        "grn-wash": "rgb(var(--nb-grn-wash) / <alpha-value>)",
        red: "rgb(var(--nb-red) / <alpha-value>)", // --red red-600
        "red-wash": "rgb(var(--nb-red-wash) / <alpha-value>)",
        amb: "rgb(var(--nb-amb) / <alpha-value>)", // --amb amber-600
        "amb-wash": "rgb(var(--nb-amb-wash) / <alpha-value>)",
        // control fills / misc from the prototype
        fill: "rgb(var(--nb-fill) / <alpha-value>)", // slate-50 input fill
        "line-strong": "rgb(var(--nb-line-strong) / <alpha-value>)", // slate-300 hover border
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px", // --r    controls
        lg: "12px", // --r-lg cards/panels
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,.05)", // --sh
        pop: "0 8px 28px rgba(15,23,42,.14)", // --sh-pop
      },
    },
  },
  plugins: [],
};

export default config;
