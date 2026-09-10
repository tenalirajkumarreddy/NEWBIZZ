// Ported 1:1 from DESIGN.md — do not diverge.
// createTokens(mode) returns the SAME shape for both modes; `tokens` stays the
// light palette as the safe default for any theme-invariant import.

const lightColor = {
  bg: "#f1f5f9",
  surface: "#ffffff",
  line: "#e2e8f0",
  lineSoft: "#f1f5f9",
  ink: "#0f172a",
  ink2: "#475569",
  ink3: "#64748b",
  ink4: "#94a3b8",
  brand: "#0891b2",
  brandD: "#0e7490",
  grn: "#059669",
  amb: "#d97706",
  ambD: "#b45309",
  red: "#dc2626",
  fill: "#f8fafc",
  brandWash: "rgba(8,145,178,0.08)",
  grnWash: "rgba(5,150,105,0.10)",
  ambWash: "rgba(217,119,6,0.10)",
  redWash: "rgba(220,38,38,0.10)",
  white15: "rgba(255,255,255,0.15)",
  white30: "rgba(255,255,255,0.30)",
} as const;

const darkColor = {
  bg: "#0b1220",
  surface: "#131c2e",
  line: "rgba(148,163,184,0.16)",
  lineSoft: "rgba(148,163,184,0.08)",
  ink: "#e2e8f0",
  ink2: "#cbd5e1",
  ink3: "#94a3b8",
  ink4: "#64748b",
  brand: "#0891b2",
  brandD: "#0e7490",
  grn: "#059669",
  amb: "#d97706",
  ambD: "#b45309",
  red: "#dc2626",
  fill: "#0f1726",
  brandWash: "rgba(8,145,178,0.16)",
  grnWash: "rgba(5,150,105,0.18)",
  ambWash: "rgba(217,119,6,0.18)",
  redWash: "rgba(220,38,38,0.18)",
  white15: "rgba(255,255,255,0.15)",
  white30: "rgba(255,255,255,0.30)",
} as const;

const base = {
  radius: { sm: 8, md: 12, lg: 16, full: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 },
  shadow: {
    card: { shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    pop: { shadowColor: "#0f172a", shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    fab: { shadowColor: "#0891b2", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  },
  font: {
    sans: "Inter_400Regular",
    sansMed: "Inter_500Medium",
    sansSemi: "Inter_600SemiBold",
    sansBold: "Inter_700Bold",
    mono: "JetBrainsMono_400Regular",
    monoBold: "JetBrainsMono_700Bold",
  },
  size: { eyebrow: 11, xs: 12, sm: 14, base: 16, lg: 18, xl: 20, xxl: 24, hero: 30 },
} as const;

export type ThemeModeName = "light" | "dark";
export type Tokens = {
  color: { readonly [K in keyof typeof lightColor]: string };
  radius: typeof base.radius;
  space: typeof base.space;
  shadow: typeof base.shadow;
  font: typeof base.font;
  size: typeof base.size;
};
export type Palette = Tokens;

export function createTokens(mode: ThemeModeName): Tokens {
  return { color: mode === "dark" ? darkColor : lightColor, ...base };
}

// Light palette default — kept so any missed import keeps working.
export const tokens: Tokens = createTokens("light");
