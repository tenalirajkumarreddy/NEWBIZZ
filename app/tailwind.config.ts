import type { Config } from "tailwindcss";

// Locked NEWBIZZ design system (see docs/superpowers/prototypes/newbizz-app-prototype.html).
// "Light tactical operations console": slate-on-white with a single cyan-600 accent,
// JetBrains Mono for every number. Hex values are copied verbatim from the prototype's
// :root block so the React build is pixel-faithful.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f1f5f9", // --bg   slate-100 app background
        surface: "#ffffff", // --surface
        line: "#e2e8f0", // --line  slate-200 border
        "line-soft": "#f1f5f9", // --line-soft
        ink: "#0f172a", // --ink   slate-900 primary text
        "ink-2": "#475569", // --ink-2 slate-600
        "ink-3": "#64748b", // --ink-3 slate-500
        "ink-4": "#94a3b8", // --ink-4 slate-400
        brand: "#0891b2", // --brand cyan-600 accent
        "brand-d": "#0e7490", // --brand-d cyan-700
        "brand-wash": "#ecfeff", // --brand-wash cyan-50
        grn: "#059669", // --grn emerald-600
        "grn-wash": "#f0fdf4",
        red: "#dc2626", // --red red-600
        "red-wash": "#fef2f2",
        amb: "#d97706", // --amb amber-600
        "amb-wash": "#fffbeb",
        // control fills / misc from the prototype
        fill: "#f8fafc", // slate-50 input fill
        "line-strong": "#cbd5e1", // slate-300 hover border
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
