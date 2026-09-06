# NEWBIZZ Android APK (Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed Android APK of NEWBIZZ — a native Expo app with a dedicated Aqua-Prime-style UI (cyan/slate theme) covering agent field ops (routes, scan, record sale/collect, stores, history) and manager ops (dash, approvals), talking directly to the existing Supabase RPCs.

**Architecture:** Expo (expo-router) app in `mobile/` at repo root. All reads via typed supabase-js queries; all money/stock writes via existing security-definer RPCs (zero new migrations). Role branching (agent/manager tabs) from custom access-token claims. Design tokens ported from `DESIGN.md`.

**Tech Stack:** Expo SDK 54 (or latest stable), TypeScript, expo-router, @supabase/supabase-js v2, @tanstack/react-query v5, expo-camera, expo-location, expo-haptics, expo-secure-store, lucide-react-native, react-native-svg, jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-06-newbizz-apk-design.md`

## Global Constraints

- Theme tokens from `DESIGN.md` (exact values): bg `#f1f5f9`, surface `#ffffff`, line `#e2e8f0`, ink `#0f172a`, ink-2 `#475569`, ink-3 `#64748b`, ink-4 `#94a3b8`, brand `#0891b2`, brand-d `#0e7490`, grn `#059669`, amb `#d97706`, red `#dc2626`.
- No emojis anywhere in code/UI (lucide icons only). No pure `#000000`. Single cyan accent.
- All numbers rendered in JetBrains Mono with tabular figures; Indian grouping (`en-IN`); compact money `₹1.84L / ₹6.43Cr`; timestamps in IST.
- Money/stock mutations ONLY through RPCs — never direct table writes for money (Invariant 3). Direct table writes allowed only for non-money rows the user owns (e.g. none in v1 — everything goes through RPCs).
- Touch targets ≥ 44px. Safe-area insets on every screen.
- Env keys are public anon key only: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from `app/.env.local`).
- Status enums (verified from live DB): `route_session_status` = pending|active|paused|completed|cancelled; `visit_type` = fulfill_order|collect_payment|record_sale|mark_visited; `order_status` = draft|confirmed|approved|challan_printed|invoiced|cancelled|fulfilled|partially_fulfilled; `invoice_status` = posted|paid|part_paid|void; `receipt_mode` = cash|upi|bank|cheque|card|adjustment.
- Permission codes used: `cashmemo.create`, `receipt.record`, `order.create`, `order.approve`, `order.cancel`, `field.routes`, `cash.transfer`, `stock.transfer`, `customer.manage`, `invoice.view`.
- Every task ends with `npx tsc --noEmit` passing (mobile workdir) before commit.

---

### Task 1: Scaffold the Expo app

**Files:**
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/babel.config.js`, `mobile/.env.example`, `mobile/.gitignore`, `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/src/theme/tokens.ts`

**Interfaces:**
- Produces: Expo project runnable via `npx expo start`; `src/theme/tokens.ts` exports `tokens` object used by every later task.

- [ ] **Step 1: Scaffold via create-expo-app**

```bash
cd "C:\Users\rajku\Documents\PUBLIC PROJECTS\NEWBIZZ"
npx create-expo-app@latest mobile --template blank-typescript
```

- [ ] **Step 2: Install dependencies**

```bash
cd mobile
npx expo install expo-router expo-constants expo-linking expo-status-bar react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated expo-secure-store expo-camera expo-location expo-haptics expo-font expo-net @tanstack/react-query @supabase/supabase-js lucide-react-native react-native-svg react-native-toast-message @expo-google-fonts/inter @expo-google-fonts/jetbrains-mono
npm i -D jest-expo jest @types/jest
```

- [ ] **Step 3: Configure app.json** (name, scheme, package id)

```json
{
  "expo": {
    "name": "NEWBIZZ",
    "slug": "newbizz",
    "scheme": "newbizz",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "splash": { "backgroundColor": "#0891b2", "resizeMode": "contain" },
    "ios": { "bundleIdentifier": "com.newbizz.app", "supportsTablet": false },
    "android": {
      "package": "com.newbizz.app",
      "versionCode": 1,
      "permissions": ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
      "adaptiveIcon": { "backgroundColor": "#0891b2" }
    },
    "plugins": [
      "expo-router",
      ["expo-camera", { "cameraPermission": "Allow NEWBIZZ to scan store QR codes." }],
      ["expo-location", { "locationWhenInUsePermission": "Allow NEWBIZZ to record visit locations." }]
    ],
    "extra": { "router": { "origin": false } }
  }
}
```

- [ ] **Step 4: babel.config.js + tsconfig + env**

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: ["react-native-reanimated/plugin"],
  };
};
```

Use plain StyleSheet styling (no nativewind) to keep the dependency surface small — remove the `jsxImportSource` line if nativewind is not installed:

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"], plugins: ["react-native-reanimated/plugin"] };
};
```

`tsconfig.json` — extend expo's, add path alias:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

`mobile/.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://wmpxwpubfxpexybqnynz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from app/.env.local>
```

Create `mobile/.env` with the real values copied from `app/.env.local` (`NEXT_PUBLIC_*` values, renamed to `EXPO_PUBLIC_*`). Ensure `mobile/.gitignore` includes `.env`.

- [ ] **Step 5: Write theme tokens**

```ts
// mobile/src/theme/tokens.ts
// Ported 1:1 from DESIGN.md — do not diverge.
export const tokens = {
  color: {
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
    red: "#dc2626",
    fill: "#f8fafc",
    brandWash: "rgba(8,145,178,0.08)",
    grnWash: "rgba(5,150,105,0.10)",
    ambWash: "rgba(217,119,6,0.10)",
    redWash: "rgba(220,38,38,0.10)",
    white15: "rgba(255,255,255,0.15)",
    white30: "rgba(255,255,255,0.30)",
  },
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

export type Tokens = typeof tokens;
```

- [ ] **Step 6: Root layout + placeholder index**

```tsx
// mobile/app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as Font from "expo-font";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import Toast from "react-native-toast-message";

export default function RootLayout() {
  const [loaded] = Font.useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_700Bold,
  });
  useEffect(() => { void loaded; }, [loaded]);
  if (!loaded) return null;
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
```

```tsx
// mobile/app/index.tsx
import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";

export default function Index() {
  return (
    <View style={[s.root, { backgroundColor: tokens.color.bg }]}>
      <Text style={{ color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.xl }}>
        NEWBIZZ
      </Text>
    </View>
  );
}
const s = StyleSheet.create({ root: { flex: 1, alignItems: "center", justifyContent: "center" } });
```

- [ ] **Step 7: Verify**

Run: `npx expo-doctor` and `npx tsc --noEmit` (in `mobile/`).
Expected: doctor passes (or only env-var warnings), tsc zero errors. `npx expo export --platform android` is NOT needed yet.

- [ ] **Step 8: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): scaffold Expo app with theme tokens and fonts"
```

---

### Task 2: Core utils (money, dates, geo) with tests

**Files:**
- Create: `mobile/src/lib/format.ts`, `mobile/src/lib/geo.ts`
- Test: `mobile/src/lib/__tests__/format.test.ts`, `mobile/src/lib/__tests__/geo.test.ts`
- Modify: `mobile/package.json` (jest config)

**Interfaces:**
- Produces: `moneyINR(n: number): string`, `moneyCompact(n: number): string` (₹1.84L/₹6.43Cr), `todayIST(): string` ("YYYY-MM-DD"), `dateIST(iso: string): string`, `timeAgoIST(iso: string): string`, `haversineKm(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number` — consumed by Tasks 6–13.

- [ ] **Step 1: Write failing tests**

```ts
// mobile/src/lib/__tests__/format.test.ts
import { moneyINR, moneyCompact, todayIST } from "../format";

describe("moneyINR", () => {
  it("groups Indian style", () => {
    expect(moneyINR(123456.5)).toBe("₹1,23,456.50");
    expect(moneyINR(0)).toBe("₹0.00");
  });
});

describe("moneyCompact", () => {
  it("uses lakh and crore", () => {
    expect(moneyCompact(184000)).toBe("₹1.84L");
    expect(moneyCompact(64300000)).toBe("₹6.43Cr");
    expect(moneyCompact(9900)).toBe("₹9,900");
  });
});

describe("todayIST", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

```ts
// mobile/src/lib/__tests__/geo.test.ts
import { haversineKm } from "../geo";

describe("haversineKm", () => {
  it("zero distance", () => {
    const p = { lat: 11.6643, lng: 78.146 };
    expect(haversineKm(p, p)).toBe(0);
  });
  it("salem to coimbatore ~160km", () => {
    const salem = { lat: 11.6643, lng: 78.146 };
    const cbe = { lat: 11.0168, lng: 76.9558 };
    const d = haversineKm(salem, cbe);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(180);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Add to `mobile/package.json`:

```json
"scripts": { "test": "jest" },
"jest": { "preset": "jest-expo", "testMatch": ["**/__tests__/**/*.test.ts?(x)"] }
```

Run: `npm test` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/format.ts
// Money & date formatting — IST everywhere, en-IN grouping (DESIGN.md §7).
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function moneyINR(n: number): string {
  return `₹${inr.format(Number.isFinite(n) ? n : 0)}`;
}

export function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${plain.format(Math.round(n / 1_00_00_000 * 100) / 100)}Cr`;
  if (abs >= 1_00_000) return `₹${plain.format(Math.round(n / 1_00_000 * 100) / 100)}L`;
  if (abs >= 1000) return `₹${plain.format(n)}`;
  return `₹${plain.format(n)}`;
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function dateIST(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgoIST(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return dateIST(iso);
}
```

```ts
// mobile/src/lib/geo.ts
const R = 6371; // km
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib mobile/package.json
git commit -m "feat(mobile): format + geo utils with tests"
```

---

### Task 3: Supabase client, session gate, claims

**Files:**
- Create: `mobile/src/lib/supabase.ts`, `mobile/src/lib/session.tsx`, `mobile/src/lib/claims.ts`
- Test: `mobile/src/lib/__tests__/claims.test.ts`
- Modify: `mobile/app/_layout.tsx` (wrap providers), `mobile/app/index.tsx` (replace with redirect logic)

**Interfaces:**
- Produces: `supabase` (browser client w/ SecureStore storage), `SessionProvider` + `useSession()` returning `{ session, profile, claims, loading, signOut }`, `parseClaims(user): AppClaims` where `AppClaims = { roles: string[]; perms: string[]; status: string }`, `can(perm: string): boolean`. Roles source: JWT `app_metadata.roles` / custom claims injected by the web's Custom Access Token Hook (`roles`, `perms`, `user_status`).

- [ ] **Step 1: Write failing claims test**

```ts
// mobile/src/lib/__tests__/claims.test.ts
import { parseClaims, can } from "../claims";

const user = (claims: object) => ({
  app_metadata: claims,
}) as any;

describe("parseClaims", () => {
  it("reads roles/perms/status from custom claims", () => {
    const c = parseClaims(user({ roles: ["agent"], perms: ["cashmemo.create", "receipt.record"], user_status: "active" }));
    expect(c.roles).toEqual(["agent"]);
    expect(c.perms).toContain("cashmemo.create");
    expect(c.status).toBe("active");
  });
  it("admin role implies all perms", () => {
    expect(can(parseClaims(user({ roles: ["admin"], perms: [] })), "order.approve")).toBe(true);
  });
  it("missing perm denies", () => {
    expect(can(parseClaims(user({ roles: ["agent"], perms: ["order.view"] })), "order.approve")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/claims.ts
export interface AppClaims {
  roles: string[];
  perms: string[];
  status: string;
}

type ClaimsUser = { app_metadata?: Record<string, unknown> } | null | undefined;

export function parseClaims(user: ClaimsUser): AppClaims {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const roles = Array.isArray(meta.roles) ? (meta.roles as string[]) : [];
  const perms = Array.isArray(meta.perms) ? (meta.perms as string[]) : [];
  const status = typeof meta.user_status === "string" ? meta.user_status : "active";
  return { roles, perms, status };
}

export function can(claims: AppClaims, perm: string): boolean {
  if (claims.roles.includes("admin")) return true;
  return claims.perms.includes(perm);
}
```

```ts
// mobile/src/lib/supabase.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "./db-types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createClient<Database>(url, anon, {
  auth: {
    storage: {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Copy the already-generated `app/src/lib/supabase/database.types.ts` to `mobile/src/lib/db-types.ts` (verbatim, it is framework-agnostic). Note in commit message.

```tsx
// mobile/src/lib/session.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { parseClaims, can as canPerm, type AppClaims } from "./claims";

interface SessionCtx {
  session: Session | null;
  user: User | null;
  claims: AppClaims;
  loading: boolean;
  can: (perm: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const claims = parseClaims(session?.user);
  const value: SessionCtx = {
    session,
    user: session?.user ?? null,
    claims,
    loading,
    can: (perm) => canPerm(claims, perm),
    signOut: () => supabase.auth.signOut(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
```

Update `app/_layout.tsx` to wrap `<SessionProvider>` + `<QueryClientProvider>` (add `@tanstack/react-query`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
// wrap: <QueryClientProvider client={qc}><SessionProvider>{children}</SessionProvider></QueryClientProvider>
```

- [ ] **Step 4: Run tests + tsc** — `npm test` PASS, `npx tsc --noEmit` PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src mobile/app
git commit -m "feat(mobile): supabase client, session provider, claims parsing"
```

---

### Task 4: Design kit components

**Files:**
- Create: `mobile/src/components/GradientHeader.tsx`, `StatTile.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `PressCard.tsx`, `SkeletonRows.tsx`, `BottomNav.tsx`, `Screen.tsx`, `Sheet.tsx` (Modal-based bottom sheet), `Bell.tsx`

**Interfaces:**
- Produces (all consumed by Tasks 6–13):
  - `<GradientHeader title subtitle children right />` — cyan-600→cyan-900 gradient, safe-area top pad, white text, optional bottom `children` (hero slot), `right` slot for bell/pills.
  - `<StatTile label value delta? tone? icon? />` — white card, eyebrow label, mono value, tinted icon chip.
  - `<StatusBadge label tone />` tone in `neutral|brand|grn|amb|red` — 10% tint pill.
  - `<EmptyState icon title message action? />` — dashed border card.
  - `<PressCard onPress children />` — scale 0.97 press feedback.
  - `<BottomNav tabs active onChange badgeCounts />` — frosted bar, raised center scan button when a tab has `center: true`.
  - `<Screen header children refreshing? onRefresh? />` — safe-area scroll wrapper w/ pull-to-refresh.
  - `<Sheet visible onClose title children />` — Modal bottom sheet (rounded top, drag handle).
  - `<Bell unreadCount onPress />` — notification bell w/ pulsing red dot.

- [ ] **Step 1: Implement components** (full code for the two most intricate; others follow the same token-driven pattern with spec below)

```tsx
// mobile/src/components/GradientHeader.tsx
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function GradientHeader({
  title, subtitle, children, right,
}: {
  title: string; subtitle?: string; children?: React.ReactNode; right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={s.row}>
        <View style={s.logo}><Text style={s.logoTxt}>N</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: "#0891b2",
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  logo: {
    width: 34, height: 34, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.white15, alignItems: "center", justifyContent: "center",
  },
  logoTxt: { color: "#fff", fontFamily: tokens.font.sansBold, fontSize: 15 },
  title: { color: "#fff", fontFamily: tokens.font.sansBold, fontSize: tokens.size.lg, letterSpacing: -0.2 },
  sub: { color: tokens.color.white30, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
});
```

```tsx
// mobile/src/components/StatTile.tsx
import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";

export function StatTile({
  label, value, delta, tone = "brand", icon: Icon,
}: {
  label: string; value: string; delta?: string;
  tone?: "brand" | "grn" | "amb" | "red"; icon?: LucideIcon;
}) {
  const wash = { brand: tokens.color.brandWash, grn: tokens.color.grnWash, amb: tokens.color.ambWash, red: tokens.color.redWash }[tone];
  const fg = { brand: tokens.color.brand, grn: tokens.color.grn, amb: tokens.color.amb, red: tokens.color.red }[tone];
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.label}>{label.toUpperCase()}</Text>
        {Icon ? (
          <View style={[s.chip, { backgroundColor: wash }]}>
            <Icon size={13} color={fg} />
          </View>
        ) : null}
      </View>
      <Text style={s.value}>{value}</Text>
      {delta ? <Text style={[s.delta, { color: delta.startsWith("▲") ? tokens.color.grn : delta.startsWith("▼") ? tokens.color.red : tokens.color.ink4 }]}>{delta}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: "rgba(226,232,240,0.6)", padding: tokens.space.md,
    ...tokens.shadow.card,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: tokens.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
  chip: { width: 26, height: 26, borderRadius: tokens.radius.sm, alignItems: "center", justifyContent: "center" },
  value: { color: tokens.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xl, marginTop: 4, fontVariant: ["tabular-nums"] },
  delta: { fontFamily: tokens.font.sansSemi, fontSize: 11, marginTop: 2 },
});
```

Remaining components (same pattern):
- **StatusBadge**: pill `borderRadius: 999`, `paddingHorizontal: 10, paddingVertical: 3`, bg = `{tone}Wash`, text = tone color, 11px `sansSemi`, optional 5px dot.
- **EmptyState**: dashed border (`borderStyle: "dashed"`, borderColor `line`), 56px muted icon circle, title 14px semibold, message 12px ink-3, optional action button.
- **PressCard**: `Pressable` wrapper, `onPressIn` → `transform: [{ scale: 0.97 }]` (animated via Reanimated or plain state), white card bg + card shadow.
- **SkeletonRows**: N rows of `animate-pulse` equivalents — use Reanimated opacity loop on `bg: lineSoft` blocks.
- **Screen**: `SafeAreaView`-equivalent (`useSafeAreaInsets`), `ScrollView` with `refreshControl={<RefreshControl refreshing onRefresh tintColor={brand} />}` when `onRefresh` given.
- **Sheet**: React-Native `Modal` `transparent animationType="slide"`, backdrop `rgba(15,23,42,0.4)` press-to-close, content pinned bottom, `borderTopLeftRadius/Right: 16`, drag handle 36×4 `line`, `maxHeight: "85%"`, keyboard-safe.
- **Bell**: `Bell` lucide icon w/ unread badge (red 16px circle + count) and `AnimatePresence`-style pulse (Reanimated loop opacity 1↔0.6 when count > 0).
- **BottomNav**: height 62 + safe bottom inset, `backgroundColor: "rgba(255,255,255,0.94)"`, top hairline, 5 slots; center slot with `center: true` renders 54px circle `brand` bg, `-26` translateY, `tokens.shadow.fab`, icon `ScanLine` white; active tab: 2px brand pill on top edge + icon/label in `brand`; inactive ink-4.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` PASS. Run `npx expo start` and confirm the app boots with placeholder index (manual check).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components
git commit -m "feat(mobile): design kit components (GradientHeader, StatTile, BottomNav, ...)"
```

---

### Task 5: Mobile data layer (queries + RPC wrapper)

**Files:**
- Create: `mobile/src/lib/rpc.ts`, `mobile/src/data/keys.ts`, `mobile/src/data/catalog.ts`, `mobile/src/data/stores.ts`, `mobile/src/data/sales.ts`, `mobile/src/data/routes.ts`, `mobile/src/data/qr.ts`, `mobile/src/data/transfers.ts`, `mobile/src/data/notifications.ts`

**Interfaces:**
- Consumes: `supabase` (Task 3), formatters (Task 2).
- Produces (exact signatures for Tasks 6–13):
  - `rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>` — calls `.rpc()`, throws `RpcError(message)` on error.
  - `qk.unread`, `qk.stores(routeId?)`, `qk.store(id)`, `qk.items(storeId?)`, `qk.today`, `qk.orders(statusFilter?)`, `qk.routeStores(routeId)`, `qk.activeSession`, `qk.visitedToday(sessionId)`, `qk.qr(code)`, `qk.custody`, `qk.notifications`.
  - `useStores(routeId?)`, `useStoreDetail(id)`, `useSellableItems()`, `useTodayKpis()`, `useOrders(status?)`, `useActiveSession()`, `useRouteStores(routeId)`, `useUnreadCount()`, `useNotifications()`, `useResolveQr(code)`.
  - Mutations (plain async fns, used inside `useMutation`): `startSession(routeId)`, `endSession(sessionId)`, `recordVisit(storeId, lat?, lng?, visitType)`, `postInvoice(header, lines)`, `placeOrder(header, lines)`, `postInvoiceFromOrder(orderId, isOfficial)`, `recordReceipt(header, allocations)`, `resolveStoreQr(code)`, `linkStoreQr(storeId, code, label?)`, `createCashTransfer(toUserId|null, amount, note|null)`, `respondTransfer(id, accept)`, `cancelTransfer(id)`, `myCustody(from?, to?)`.

- [ ] **Step 1: RPC wrapper**

```ts
// mobile/src/lib/rpc.ts
import { supabase } from "./supabase";

export class RpcError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new RpcError(error.message, error.code);
  return data as T;
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/credit limit/i.test(msg)) return "Credit limit exceeded for this customer";
  if (/insufficient|stock/i.test(msg)) return msg; // stock errors are already descriptive
  if (/not authorized|permission|required/i.test(msg)) return "You do not have permission for this action";
  if (/Failed to fetch|Network|fetch/i.test(msg)) return "Network error — check your connection";
  return msg;
}
```

- [ ] **Step 2: Query keys**

```ts
// mobile/src/data/keys.ts
export const qk = {
  stores: (routeId?: string) => ["stores", routeId ?? "all"] as const,
  store: (id: string) => ["store", id] as const,
  ledger: (customerId: string) => ["ledger", customerId] as const,
  items: () => ["items"] as const,
  today: () => ["today"] as const,
  orders: (status?: string) => ["orders", status ?? "all"] as const,
  routes: () => ["routes"] as const,
  routeStores: (routeId: string) => ["routeStores", routeId] as const,
  activeSession: () => ["activeSession"] as const,
  visited: (sessionId: string) => ["visited", sessionId] as const,
  custody: () => ["custody"] as const,
  notifications: () => ["notifications"] as const,
  unread: () => ["unread"] as const,
  holdings: () => ["stockHoldings"] as const,
};
```

- [ ] **Step 3: Data modules** — each module is a set of hooks using `useQuery` + mutation fns calling `rpc`. Key query bodies (verified against live DB):

```ts
// mobile/src/data/stores.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "./keys";

export interface StoreRow {
  id: string; name: string; code: string | null; area: string | null;
  phone: string | null; routeId: string | null; routeName: string | null;
  customerName: string | null; outstanding: number; lat: number | null; lng: number | null;
}

export function useStores(routeId?: string) {
  return useQuery({
    queryKey: qk.stores(routeId),
    queryFn: async (): Promise<StoreRow[]> => {
      let q = supabase
        .from("customer_stores")
        .select(`id, name, code, area, phone, lat, lng, route_id, status,
                 route:routes(name),
                 customer:customers(name)`)
        .eq("status", "active")
        .order("name");
      if (routeId) q = q.eq("route_id", routeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, code: r.code, area: r.area, phone: r.phone,
        routeId: r.route_id, routeName: r.route?.name ?? null,
        customerName: r.customer?.name ?? null, outstanding: 0, // filled lazily per store via store_outstanding in detail
        lat: r.lat, lng: r.lng,
      }));
    },
  });
}

export function useStoreDetail(id: string) {
  return useQuery({
    queryKey: qk.store(id),
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("customer_stores")
        .select(`*, route:routes(name), customer:customers(id, name, phone, credit_limit)`)
        .eq("id", id).single();
      if (error) throw error;
      const { data: outstanding } = await supabase.rpc("store_outstanding", { p_store: id });
      return { store, outstanding: Number(outstanding ?? 0) };
    },
    staleTime: 0,
  });
}
```

`catalog.ts` — `useSellableItems()`:

```ts
const { data } = await supabase
  .from("items")
  .select("id, name, sku, unit, is_sellable, price_list_items(price, min_qty)")
  .eq("is_sellable", true).eq("status", "active").order("name");
```

(If `items.status` does not exist in the generated types, drop that `.eq` — verify against `db-types.ts` when implementing; the `Items` table has `is_sellable` per migration 0005.)

`sales.ts` — `useTodayKpis()` mirrors web `getSalesTodayKpis` client-side:

```ts
const today = todayIST();
const [inv, rcpt] = await Promise.all([
  supabase.from("invoices").select("grand_total, status, created_by, invoice_date").eq("invoice_date", today).neq("status", "void"),
  supabase.from("customer_receipts").select("amount, status, collected_by, receipt_date").eq("receipt_date", today).eq("status", "posted"),
]);
// salesTotal from inv; collectedTotal from rcpt where collected_by = me (RLS also scopes)
```

`useOrders(status?)`: `sales_orders` select `id, order_no, order_date, status, store_id, store:customer_stores(name), total_amount, notes, lines: sales_order_lines(item_id, qty, unit_price, item:items(name))` filtered `in ("draft","confirmed","approved")` or a specific status, order `created_at desc`, limit 50.

`routes.ts`:
- `useRoutes()`: `routes` select `id, name, is_default, status, stores: customer_stores(count)` where status active.
- `useRouteStores(routeId)`: `customer_stores` where `route_id = routeId` and status active, order name.
- `useActiveSession()`: `route_sessions` select `*` where `agent_id = user.id` and `status = "active"` maybeSingle.
- `startSession(routeId)`: insert `route_sessions { route_id, agent_id: uid, status: "active", started_at: now, stores_planned: storeCount }` (direct insert is RLS-gated; no money).
- `endSession(sessionId, storesCompleted)`: update `route_sessions set status "completed", ended_at now() where id and agent_id = uid`.
- `recordVisit(storeId, lat?, lng?, visitType = "mark_visited")`: `rpc("record_visit", { p_store_id, p_lat, p_lng, p_visit_type, p_duration_min: 5 })`.
- `useVisitedToday(sessionId)`: `visits` select `customer_store_id` where `route_session_id = sessionId`.

`qr.ts`:
- `resolveStoreQr(code)` → `rpc<ResolvedStore>("resolve_store_qr", { p_code: code })` where `ResolvedStore = { found: boolean; code: string; store_id?: string; customer_id?: string; store_name?: string; customer_name?: string; area?: string; lat?: number|null; lng?: number|null; outstanding?: number; open_challans?: number; can_manage?: boolean; can_sell?: boolean; can_collect?: boolean; can_visit?: boolean }`.
- `linkStoreQr(storeId, code, label?)` → `rpc("link_store_qr", { p_store_id, p_code, p_label })`.

`transfers.ts`:
- `myCustody()` → `rpc<{ transfer_id; transfer_no; type; status; from_user_id; to_user_id; amount; note; created_at; responded_at; cash_in_hand }[]>("my_transfers_and_custody", { p_from: isoDate(-30), p_to: todayIST() })`.
- `createCashTransfer(toUserId: string | null, amount: number, note: string | null)` → `rpc("create_transfer", { p_header: { type: "cash", from_user_id: uid, to_user_id: toUserId ?? null, amount, deposit_account: toUserId ? null : "1120", note } , p_lines: [] })`.
- `respondTransfer(id, accept)` → `rpc("respond_transfer", { p_id: id, p_accept: accept })`.
- `cancelTransfer(id)` → `rpc("cancel_transfer", { p_id: id })`.

`notifications.ts` — `useNotifications()`: `notifications` select `*` where `user_id = uid` order created_at desc limit 50; `useUnreadCount()`: count where `status = "unread"` (subscribe to postgres_changes on `notifications` to invalidate); `markRead(ids)` → `rpc("mark_notifications_read", { p_ids: ids })`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` PASS; `npm test` still PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/rpc.ts mobile/src/data
git commit -m "feat(mobile): typed data layer over existing RPCs and tables"
```

---

### Task 6: Auth flow (login, pending)

**Files:**
- Create: `mobile/app/login.tsx`, `mobile/app/pending.tsx`
- Modify: `mobile/app/_layout.tsx` (auth gate: loading splash → login when no session → pending when `claims.status !== "active"` → app)

**Interfaces:**
- Consumes: `useSession`, `supabase.auth.signInWithOtp({ phone })`, `verifyOtp({ phone, token, type: "sms" })`.
- Produces: authenticated root; routes to `(tabs)` on success.

- [ ] **Step 1: Login screen** — GradientHeader-less centered layout on `bg`:
  - Logo tile (56px brand rounded-2xl "N"), app name, "Business Management" subtitle.
  - Phone input: `+91` prefix pill, 10-digit `keyboardType="phone-pad"`, mono font.
  - **Send OTP** primary button (brand, 48px, `sansSemi`).
  - OTP state: 6-box input (single TextInput w/ letter-spacing, mono, centered), **Verify** button, **Change number** ghost button.
  - States: `sending` (spinner), `sent` (toast "OTP sent"), error toast via `friendlyError`.
  - On verify success: router.replace to root (gate handles the rest). `claims.status === "pending"` renders `pending.tsx` (lock icon, "Account pending approval", contact message, sign-out button).

- [ ] **Step 2: Wire the gate in _layout** — `useSession()`; `loading` → splash (brand bg + logo); no session → render login via `<Stack>` screen redirect; else tabs.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; manual run on device/emulator: OTP login against live project (SMS hook must be enabled — if not enabled, verify with the Supabase dashboard "magic" OTP for phone auth in dev).

- [ ] **Step 4: Commit**

```bash
git add mobile/app
git commit -m "feat(mobile): phone-OTP login + pending gate"
```

---

### Task 7: App shell + role tabs + connectivity + bell

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/home.tsx` (placeholder), `route.tsx`, `scan.tsx`, `stores.tsx`, `history.tsx`, `dash.tsx`, `approvals.tsx`, `more.tsx`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `useSession().claims.roles`, design kit, `useUnreadCount`.
- Produces: role-based tab shells. Tabs:
  - **Agent** (`roles` includes `agent` OR no manager perms): `Home`(Home) · `Routes`(Map) · `Scan`(center FAB, ScanLine) · `Stores`(Users) · `History`(History)
  - **Manager/Others**: `Dash`(LayoutDashboard) · `Approvals`(ClipboardCheck) · `Sell`(center FAB, Plus → record modal) · `Customers`(Users) · `More`(Menu)
- Connectivity pill: `NetInfo` listener → emerald tint "Online" / red tint "Offline" rendered in each GradientHeader `right` slot via shared `<ConnectivityPill />`.
- Notification bell: `<Bell unreadCount onPress={() => router.push("/notifications")} />`.

- [ ] **Step 1: Tab layout** — expo-router `<Tabs>` with `screenOptions={{ headerShown: false, tabBarShowLabel: true }}` and a custom `tabBar` prop rendering `<BottomNav tabs={...} active={state.index} onChange={jumpTo} badgeCounts={{ history: pendingHandovers }} />`. Role selection: read `claims.roles`; center tab routes: agent → `(tabs)/scan`, manager → pushes `/record?mode=scan` (record modal placeholder for now).
- [ ] **Step 2: Placeholder screens** — each tab = `<Screen header={<GradientHeader title subtitle right={<ConnectivityPill />}><Bell .../></GradientHeader>}><EmptyState title="Coming in Task N" /></Screen>`.
- [ ] **Step 3: Verify** — tsc; device run: login lands on correct tab set per role.
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): role tab shells with connectivity pill and bell"`.

---

### Task 8: Agent Home

**Files:**
- Modify: `mobile/app/(tabs)/home.tsx`
- Create: `mobile/src/features/home/RevenueCard.tsx`, `NextStopCard.tsx`, `VanStockCard.tsx`, `ActiveRouteCard.tsx`

**Interfaces:**
- Consumes: `useTodayKpis`, `useStores`, `useActiveSession`, `useRouteStores`, `useVisitedToday`, `useOrders("pending")`, `useStockHoldings` (`user_stock_holdings` select `item_id, qty, avg_cost, item:items(name, sku, unit)` where `user_id = uid` and `qty > 0`), `haversineKm`, `moneyCompact`.
- Produces: home screen; Next-Stop actions push `/record?storeId=&mode=sale|collect` and `/store/[id]`.

- [ ] **Step 1: Compose the screen** top-to-bottom:
  1. GradientHeader "Good {morning|afternoon|evening}, {first name}" + role subtitle + right: ConnectivityPill + Bell.
  2. `<RevenueCard>` — eyebrow "TODAY", big mono `moneyCompact(salesTotal)`, delta row, divider, two legend rows: Cash (grn dot, sum of cash receipts) / UPI (brand dot).
  3. StatTile row (3-up): Sales / Collections / Pending orders count.
  4. `<VanStockCard>` (only if holdings non-empty): amber Boxes chip header "Van stock", 3-up mini tiles (Products / Units / Value), scrollable per-item rows (name, sku mono, qty, value).
  5. `<ActiveRouteCard>` — if session active: route name, "visited X of N · elapsed", progress bar (3px brand fill), End button (Alert confirm → `endSession`, invalidate). Else dashed "No active route" → button to Routes tab.
  6. `<NextStopCard>` — nearest unvisited store (haversine from current location; falls back to first unvisited): photo/initial chip, name, area, `moneyINR(outstanding)` red, buttons row: Navigate (`Linking.openURL("https://maps.google.com/?daddr={lat},{lng}")`), Call (`tel:`), Sale (brand solid), Collect (outline), Visit (`recordVisit` w/ GPS).
  7. Pending orders list (top 5): ShoppingCart amber chip, store name, order_no mono, chevron → Routes tab orders view.
  8. Pull-to-refresh invalidates all home keys.
- [ ] **Step 2: Verify** — tsc; device: verify numbers against web dashboard for same day.
- [ ] **Step 3: Commit** — `git commit -m "feat(mobile): agent home (revenue, van stock, active route, next stop, pending orders)"`.

---

### Task 9: Routes tab (session lifecycle + visits + orders)

**Files:**
- Modify: `mobile/app/(tabs)/route.tsx`
- Create: `mobile/src/features/routes/RouteCard.tsx`, `SessionPanel.tsx`, `OrdersView.tsx`, `VisitReasonSheet.tsx`

**Interfaces:**
- Consumes: `useRoutes`, `useRouteStores`, `useActiveSession`, `recordVisit`, `startSession`, `endSession`, `useOrders`, `postInvoiceFromOrder`, data-layer keys.
- Produces: order "Fulfill" navigates to `/record?mode=sale&orderId={id}&storeId={store_id}` (Task 10 prefills cart from order lines).

- [ ] **Step 1: Views** — segmented pill toggle "Routes | Orders".
  - **SessionPanel** (top of Routes view): no session → brand "Start route session" button → Sheet w/ route picker → `startSession` (captures GPS via expo-location, stored client-side for Next-Stop only). Active → pulsing dot, route name, `{visited}/{planned}`, elapsed timer, red "End session" (confirm dialog shows session sales/collections totals from `invoices`/`customer_receipts` queries since `started_at`).
  - **RouteCard** list: colored left accent bar (cycling brand/grn/amb/ink4), name, store count, active pill; expand → store rows w/ per-store actions: Visit (VisitReasonSheet: `mark_visited` + optional note → `recordVisit(storeId, lat, lng, type)`), Sale, Collect, Navigate, Call.
  - **OrdersView**: status chips (all/pending=confirmed/approved/delivered=fulfilled/cancelled), order cards (order_no mono, store name, lines preview, total mono, status badge), actions: **Fulfill** (status confirmed/approved + perm `cashmemo.create`) → `/record?mode=sale&orderId=…`; **Invoice** (approved + perm `invoice.create`) → `postInvoiceFromOrder(orderId, true)` → receipt modal; **Cancel** (perm `order.cancel`) → reason sheet → `supabase.from("sales_orders").update({ status: "cancelled" })` is NOT allowed (money-adjacent) — v1: hide Cancel if no RPC exists; the web cancels via direct RLS update + write_audit, so mirror exactly: RLS update + `rpc("write_audit", { p_action: "update", p_entity: "sales_orders", p_entity_id: id, p_summary: "Cancelled from mobile: {reason}" })`.
- [ ] **Step 2: Verify** — tsc; device: start session → visit 2 stores → end session with summary; fulfill a test order into Record.
- [ ] **Step 3: Commit** — `git commit -m "feat(mobile): routes tab (session panel, route cards, visits, orders view)"`.

---

### Task 10: Scan tab (QR → store actions)

**Files:**
- Modify: `mobile/app/(tabs)/scan.tsx`
- Create: `mobile/src/features/scan/QrViewport.tsx`, `IdentifiedStoreCard.tsx`, `NearbyStores.tsx`, `LinkQrSheet.tsx`
- Create: `mobile/src/lib/qrparse.ts` + `mobile/src/lib/__tests__/qrparse.test.ts`

**Interfaces:**
- Consumes: `resolveStoreQr`, `linkStoreQr`, `useStores` (nearby fallback), expo-camera, expo-location, `ResolvedStore` type.
- Produces: `parseQrPayload(raw: string): string | null` — extracts code from `newbizz://s/{code}` scheme URLs, `https://…/s/{code}` links, or bare codes (`NB-…`); returns null otherwise. Tests cover all three forms.

- [ ] **Step 1: Failing tests for qrparse** (`npm test` → fail → implement → pass):

```ts
import { parseQrPayload } from "../qrparse";
it("parses scheme url", () => expect(parseQrPayload("newbizz://s/NB-0142")).toBe("NB-0142"));
it("parses https link", () => expect(parseQrPayload("https://newbizz.in/s/NB-0142?x=1")).toBe("NB-0142"));
it("accepts bare code", () => expect(parseQrPayload("NB-0142")).toBe("NB-0142"));
it("rejects junk", () => expect(parseQrPayload("hello world")).toBeNull());
```

- [ ] **Step 2: QrViewport** — expo-camera `CameraView` `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`, `onBarcodeScanned` debounced 1.5s; overlay: corner brackets (4 positioned views, brand), animated scan line (Reanimated loop), status pill ("Point at the store QR code" / "Looking up store…"). Camera permission denied → friendly retry screen.
- [ ] **Step 3: Identified flow** — on scan: `parseQrPayload` → `resolveStoreQr(code)` → found → `<IdentifiedStoreCard>` (emerald header "Store identified", name, customer, area, outstanding red/green, open challans badge, permission-gated actions: Sale / Collect / Visit / Open profile / Navigate) → not found → amber card "Code not linked" + (if `can_manage`) "Link to a store" → `<LinkQrSheet>` (store search + confirm → `linkStoreQr(storeId, code)`).
- [ ] **Step 4: Nearby mode** — toggle "QR | Nearby": expo-location → `useStores()` sorted by `haversineKm` → top 5 rows (name, area, distance m/km mono) → tap → same Identified card.
- [ ] **Step 5: Verify** — tsc + tests; device: scan a linked QR (create one via More → Store QRs in Task 12, or insert via dashboard), walk through Sale.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): scan tab (QR resolve, nearby stores, link sheet)"`.

---

### Task 11: Record flow (sale + collect)

**Files:**
- Create: `mobile/app/record.tsx` (full-screen modal stack screen), `mobile/src/features/record/StorePickerSheet.tsx`, `ItemList.tsx`, `PaymentSplit.tsx`, `BalanceSummary.tsx`, `CreditBanner.tsx`, `ReceiptModal.tsx`, `CollectForm.tsx`
- Modify: `mobile/app/_layout.tsx` (register `<Stack.Screen name="record" presentation="fullScreenModal" />`)

**Interfaces:**
- Consumes: `postInvoice`, `recordReceipt`, `useSellableItems`, `useStoreDetail`, `customer_outstanding` rpc, `check_credit_limit` is server-side (banner computed client-side from `customers.credit_limit` + outstanding), order prefill via `useLocalSearchParams` (`mode`, `storeId`, `orderId`).
- Produces: successful sale → invalidates `qk.today`, `qk.store(id)`, `qk.orders()`, `qk.holdings` → ReceiptModal.

- [ ] **Step 1: Screen skeleton** — GradientHeader "New sale" / "Collect payment" + segmented toggle (both modes one screen; permission-gated: `cashmemo.create` / `receipt.record`).
- [ ] **Step 2: StorePickerSheet** — search box + list of `useStores()` rows w/ outstanding + "Nearest" sort button (expo-location + haversine); emits store.
- [ ] **Step 3: Sale mode** —
  - Store card (selected store, outstanding via `store_outstanding`).
  - If `orderId` param: load order lines as cart, banner "Fulfilling order {order_no}".
  - `ItemList`: sellable items rows — name, `moneyINR(price)` (from `price_list_items` of the store's `price_list_id` fallback to base price list; pick lowest `min_qty ≤ qty`), stock not shown v1 (stock verified server-side by `post_invoice`); qty steppers (− input +), line total mono.
  - `PaymentSplit`: Cash + UPI `numeric` inputs (agent collects on the spot; remainder = credit).
  - `CreditBanner`: `customer_outstanding(customerId)` + credit limit from store detail → exceeded → red banner blocks submit unless role admin (perm `credit.override` allows override w/ confirm); >80% → amber warn.
  - Submit: `postInvoice(header, lines)` where `header = { store_id, invoice_date: today, place_of_supply?, is_official: false }` and `lines = [{ item_id, qty, unit_price }]`; then if cash+upi > 0 → `recordReceipt({ customer_id, amount: cash+upi, mode: cash >= upi ? (upi > 0 ? "cash" : "cash") : "upi", deposit_account: "2140", collected_by: uid, store_id, notes: "Collected on sale" }, [{ invoice_id, amount: cash+upi }])` — note: if BOTH cash and upi collected, two receipts (one per mode). Errors → toast `friendlyError`.
  - `ReceiptModal`: success sheet w/ invoice_no (mono), total, paid, balance, "Done" (invalidate + back).
- [ ] **Step 4: Collect mode** — `CollectForm`: store picker (emerald styling), outstanding display, amount input (Cash / UPI / Bank / Cheque via mode chips — `payment_methods` map: cash→"2140", upi_agent→"2140", upi_company/bank/cheque→"1120"), reference + notes, open-invoice allocation list (`invoices` where customer, status posted/part_paid, show `grand_total - amount_paid`) with per-invoice allocation inputs (default: oldest-first auto-fill; allow manual), submit → `recordReceipt(header, allocations)`, ReceiptModal.
- [ ] **Step 5: Verify** — tsc; device E2E: sale with partial cash → verify on web: invoice + receipt exist, ledger updated, AR reduced; over-limit sale blocked with banner.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): record flow (sale via post_invoice, collect via record_receipt, credit banners, receipt)"`.

---

### Task 12: Stores tab + Store profile + Add-store wizard

**Files:**
- Modify: `mobile/app/(tabs)/stores.tsx`
- Create: `mobile/app/store/[id].tsx`, `mobile/src/features/stores/StoreCard.tsx`, `LedgerList.tsx`, `AddStoreWizard.tsx`
- Create: `mobile/app/more/store-qr.tsx` (QR admin)

**Interfaces:**
- Consumes: `useStores`, `useStoreDetail`, `customer_activity` rpc (ledger rows: kind, ref_no, debit/credit, event_ts), `recordVisit`, `postInvoice` via `/record` push, expo-location, `Linking`.
- Produces: store rows used by scan nearby list too.

- [ ] **Step 1: Stores tab** — GradientHeader "Stores" + search + route filter chips (from `useRoutes`); `StoreCard` list: 40px initial chip (brandWash), name, customer + area, `moneyINR(outstanding)` red (fetch outstanding lazily per visible card via `store_outstanding` — batch: v1 shows outstanding only where `customer_outstanding` already cached; acceptable), action row icons: Sale / Collect / Visit / Navigate / Call. FAB (bottom-right above nav) → AddStoreWizard.
- [ ] **Step 2: Store profile** (`store/[id].tsx`) — hero card (name, code mono, customer, badges route/kind, Navigate/Call), StatTile row (Outstanding, Credit limit), quick actions row, "Recent activity" ledger via `customer_activity(p_customer, p_from: -90d, p_store: id)` rows: kind icon (sale ShoppingCart brand / payment Wallet grn), ref_no mono, `+credit / −debit` colored, date.
- [ ] **Step 3: AddStoreWizard** — 3-step Sheet flow: (1) customer — existing (`search_customers(p_query)`) or new (name, phone); (2) store — name, kind chip, route picker, address, area, GPS capture (expo-location → lat/lng green chip); (3) review + submit — v1 creates via direct RLS inserts into `customers`/`customer_stores` ONLY if perm `customer.manage` (these are non-money master rows; the web does the same) + `write_audit`; money remains untouched.
- [ ] **Step 4: Store QRs admin** (`more/store-qr.tsx`, perm `customer.manage`) — store search → selected store shows existing QR codes; "Generate & link" → `linkStoreQr(storeId, "NB-" + (store.code ?? storeId.slice(0,8)))`; render QR via `react-native-qrcode-svg` + "Print/Share" (`expo-sharing` on the QR — v1: display full-screen for the shop to scan/photo).
- [ ] **Step 5: Verify** — tsc; device: search, profile ledger matches web customer page, add store wizard creates + audit row appears in web admin, QR links and scans back (Task 10 loop).
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): stores tab, store profile w/ ledger, add-store wizard, QR admin"`.

---

### Task 13: History tab + transfers + notifications + profile

**Files:**
- Modify: `mobile/app/(tabs)/history.tsx`
- Create: `mobile/src/features/history/BalanceOverview.tsx`, `ActivityList.tsx`, `TransfersList.tsx`, `HandoverSheet.tsx`, `mobile/app/notifications.tsx`, `mobile/app/profile.tsx`, `mobile/app/more.tsx` (full)

**Interfaces:**
- Consumes: `myCustody` (cash_in_hand), `useTodayKpis`, `useNotifications`, `markRead`, `createCashTransfer`, `respondTransfer`, `cancelTransfer`, `listActiveUsers` (users select id, full_name where status active).
- Produces: More screen links: Store QRs (Task 12), Profile, Notifications, Sign out.

- [ ] **Step 1: BalanceOverview** — 2×2 StatTiles: Today sales, Today collections, Transferred today (sum of accepted `my_transfers_and_custody` created today), **Cash in hand** (`cash_in_hand` mono, red "You owe" when > 0 semantics: this is company cash in your custody). Buttons: "Hand over cash" (HandoverSheet), "Deposit to bank" (same sheet w/ `toUserId = null` → `deposit_account: "1120"`).
- [ ] **Step 2: HandoverSheet** — recipient select (`users` active, exclude self), amount (prefill min(cash_in_hand, typed)), note; submit → `createCashTransfer(toUserId, amount, note)`; server enforces holding sufficiency (RPC raises) → friendly toast.
- [ ] **Step 3: Segmented views** — Activity | Handovers.
  - Activity: day-grouped cards from `invoices` (created_by = me, last 7 days) + `customer_receipts` (collected_by = me): rows w/ type badge, doc_no mono, amount, store/customer.
  - Handovers: `my_transfers_and_custody` rows — direction arrow, transfer_no mono, amount, status badge (pending amb / accepted grn / rejected red); incoming pending (`to_user_id = me`, status pending) → Confirm / Reject buttons → `respondTransfer(id, true|false)`; own pending → Cancel.
- [ ] **Step 4: Notifications screen** — list w/ severity tint chips, "Mark all read" → `markRead(ids)`, realtime invalidation already set (Task 5).
- [ ] **Step 5: Profile screen** — user card (initials, name, phone, roles chips), permission list (claims.perms as neutral badges), sign-out (confirm → `signOut()`), app version footer.
- [ ] **Step 6: More screen (manager role)** — links list: Approvals, Store QRs (perm-gated), Notifications, Profile, plus "Open web admin" (Linking to Vercel URL).
- [ ] **Step 7: Verify** — tsc; device E2E: two test users — agent hands over cash, manager confirms, custody balances move (verify via web user_cash_holdings read-model).
- [ ] **Step 8: Commit** — `git commit -m "feat(mobile): history, cash handovers, notifications, profile, more"`.

---

### Task 14: Manager dash + approvals

**Files:**
- Modify: `mobile/app/(tabs)/dash.tsx`, `mobile/app/(tabs)/approvals.tsx`, `mobile/app/(tabs)/customers.tsx` (reuse Stores list w/ no route filter)

**Interfaces:**
- Consumes: `useTodayKpis`, `get_ar_aging` rpc (outstanding buckets), `useOrders("confirmed")`, `postInvoiceFromOrder`, `useStores`.
- Produces: manager home parity.

- [ ] **Step 1: Dash** — GradientHeader hero w/ today sales metric + delta; StatTile grid (Outstanding total from `get_ar_aging` sum, Collections today, Open orders count, Active sessions count); "Needs attention" card: overdue AR rows (aging > 30d top 3) + pending orders count; weekly sales mini bar chart (7 columns, heights normalized, today highlighted brand) — pure View-based chart (no chart lib).
- [ ] **Step 2: Approvals** — pending orders (`status = "confirmed"` or `"approved"`) list w/ store, lines, total, credit headroom (outstanding vs limit); actions: **Approve & invoice** (`postInvoiceFromOrder(orderId, true)`) or **Open order** (Routes orders view). After approve: invalidate orders + today.
- [ ] **Step 3: Customers tab** — same `<StoresTabBody>` component as Stores tab without route filter (extract shared component in `src/features/stores/StoresTabBody.tsx`).
- [ ] **Step 4: Verify** — tsc; device: manager sees dash + approves a test order → invoice appears on web.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): manager dash + approvals"`.

---

### Task 15: Android build pipeline (signed APK)

**Files:**
- Create: `mobile/android/` (via prebuild, committed), `mobile/keystore/README.md` (no keys in git)
- Modify: `mobile/app.json` (icon assets), `mobile/package.json` (build scripts)

**Interfaces:**
- Consumes: everything above.
- Produces: `mobile/android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 1: Icon + splash assets** — generate 1024px icon (brand bg, white N monogram) → `mobile/assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png`; reference in app.json (`icon`, `splash.image`).
- [ ] **Step 2: Prebuild**

```bash
cd mobile && npx expo prebuild -p android
```

- [ ] **Step 3: Generate keystore (ONE TIME, outside git)**

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore "%USERPROFILE%\.newbizz\newbizz-release.keystore" -alias newbizz -keyalg RSA -keysize 2048 -validity 10000
```

`mobile/android/gradle.properties` (local only — file is gitignored; provide `gradle.properties.example`):

```
NEWBIZZ_UPLOAD_STORE_FILE=C:/Users/rajku/.newbizz/newbizz-release.keystore
NEWBIZZ_UPLOAD_STORE_PASSWORD=<set>
NEWBIZZ_UPLOAD_KEY_ALIAS=newbizz
NEWBIZZ_UPLOAD_KEY_PASSWORD=<set>
```

Wire signing config in `android/app/build.gradle` (standard Expo signingConfig block reading those properties; skip signing silently when absent so debug builds work).

- [ ] **Step 4: Build release APK**

```bash
cd mobile/android && .\gradlew assembleRelease
```

Expected: `app\build\outputs\apk\release\app-release.apk` produced.

- [ ] **Step 5: Device smoke test**

```bash
adb install -r mobile\android\app\build\outputs\apk\release\app-release.apk
```

Manual checklist on device: OTP login → tabs per role → scan a linked QR → record a ₹-test sale (cash) → collect → handover → confirm from manager account → verify ledger on web.

- [ ] **Step 6: Commit**

```bash
git add mobile/android mobile/assets mobile/package.json mobile/README.md
git commit -m "feat(mobile): android release build pipeline (signed APK)"
```

`mobile/README.md` documents: build steps, keystore location (outside repo), versionCode bump checklist, where the APK lands.

---

## Self-Review

**Spec coverage check:**
- §2 Decisions (scope, Expo, phone OTP, both roles, online-only, direct APK, QR center tab) → Tasks 1, 6, 7, 10, 15 ✓
- §3 Architecture (expo-router, tanstack-query, RPC-only writes, claims) → Tasks 3, 5 ✓
- §4 Existing RPCs (resolve_store_qr, record_visit, transfers, post_invoice, record_receipt, get_ar_aging…) → Tasks 5, 9–14 ✓
- §5 Design system tokens/components → Tasks 1 (tokens), 4 (kit) ✓
- §6 Navigation (role tab sets, record modal, store profile stack) → Tasks 7, 11, 12 ✓
- §7 Screens: Home (8), Routes (9), Scan (10), Record (11), Stores/Profile/Wizard/QR admin (12), History/Transfers/Notifications/Profile/More (13), Dash/Approvals/Customers (14) ✓
- §8 Error handling (friendlyError, credit banners, connectivity) → Tasks 5, 11, 7 ✓
- §9 Testing (utils unit tests, manual E2E checklists) → Tasks 2, 3, 10 + per-task device verification ✓
- §10 Build (prebuild, keystore outside git, assembleRelease, adb smoke) → Task 15 ✓
- §11 Out of scope respected — no offline queue, no FCM ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code or exact composition spec with named imports/interfaces from earlier tasks. Two "verify against db-types" notes are explicit verification steps, not placeholders.

**Type consistency:** `StoreRow` (Task 5) consumed by StoreCard (12) and NearbyStores (10) ✓; `ResolvedStore` produced by qr.ts and consumed by scan features ✓; qk keys used identically across tasks ✓; `moneyINR/moneyCompact/todayIST/haversineKm` signatures consistent ✓.
