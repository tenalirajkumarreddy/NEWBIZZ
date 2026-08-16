# NEWBIZZ Design System

> Water-bottle manufacturing management system — light tactical operations console..

- **Design Variance:** 8 (asymmetric, fractional grids, purposeful whitespace)
- **Motion Intensity:** 6 (fluid CSS transitions, spring physics, staggered reveals)
- **Visual Density:** 4 (airy, gallery-spacing, generous paddings)

---

## 1. Palette

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f1f5f9` (slate-100) | App background |
| `--surface` | `#ffffff` | Card/sheet surface |
| `--line` | `#e2e8f0` (slate-200) | Borders, dividers |
| `--line-soft` | `#f1f5f9` | Subtle divide |
| `--ink` | `#0f172a` (slate-900) | Primary text |
| `--ink-2` | `#475569` (slate-600) | Secondary |
| `--ink-3` | `#64748b` (slate-500) | Tertiary |
| `--ink-4` | `#94a3b8` (slate-400) | Label, muted |
| `--brand` | `#0891b2` (cyan-600) | SINGLE accent |
| `--brand-d` | `#0e7490` (cyan-700) | Brand hover |
| `--grn` | `#059669` (emerald-600) | Positive |
| `--amb` | `#d97706` (amber-600) | Warning |
| `--red` | `#dc2626` (red-600) | Negative |

Rules:
- Single accent: cyan-600. No purple, no neon, no secondary accent.
- Saturation < 80% for all accents.
- No pure `#000000`. Deepest is `#0f172a`.
- Neutral base must be consistent (slate only — no zinc/stone mixing).

---

## 2. Typography

| Role | Family | Size | Weight |
|---|---|---|---|
| UI labels / keys | Inter (sans) | 11px `eyebrow` | 600 |
| Body / nav | Inter | 13px | 400 / 600 |
| Data / metrics | JetBrains Mono | 13–24px | 400 / 700 |
| Toolbar / buttons | Inter | 12–14px | 600 |

- **`eyebrow` utility:** `text-[11px] font-semibold uppercase tracking-[0.06em]`
- All numbers render in JetBrains Mono with `tabular-nums`.
- Never use Inter in "premium" creative contexts — but for a dashboard/ops tool it is the default.
- No serif fonts. No oversized H1s.

---

## 3. Spacing & Layout

- **Page max-width:** `max-w-[1440px] mx-auto`
- **Page padding:** `px-6 lg:px-8 py-6`
- **Shell grid:** 236px sidebar / 1fr content | 58px topbar / 1fr body / 34px status bar
- **Viewport:** `min-h-[100dvh]` — NEVER `h-screen` or `h-dvh`
- **Section gaps:** `gap-4` between panels
- **Card padding:** `p-4` (or `px-4 py-3` for header rows)
- **Mobile:** All asymmetric grids collapse to single column below `md:` using `w-full px-4 py-8`. For layouts with `grid-cols-4`, use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.

Grid over flexbox percentage math — always use CSS Grid for structural layouts (`grid grid-cols-3` not `w-[calc(33%-1rem)]`).

---

## 4. Surfaces & Elevation

- **Card:** `rounded-lg border border-line bg-surface shadow-card` (12px radius, soft 2px/12px shadow)
- **Panel:** Card + optional titled header with `border-b border-line`
- **Hover:** `shadow-pop` (8px/28px shadow) on interactive cards
- **Controls:** `rounded-lg` (8px) — buttons, inputs, selects
- **Avatars:** `rounded-full`
- **No card overuse:** Use cards only when elevation communicates hierarchy. Data tables can sit directly on the page background with border separation.

Common patterned surfaces:
- **Input fill:** `bg-fill` (#f8fafc)
- **Brand wash:** `bg-brand-wash text-brand ring-1 ring-brand/20`
- **Status washes:** `bg-grn-wash text-grn ring-1 ring-grn/20`, etc.

---

## 5. Component Patterns

### Button
- 4 variants: primary (cyan), secondary (white+slate border), ghost (transparent), danger (red), subtle (slate fill)
- 3 sizes: sm (32px), md (36px, default), lg (40px)
- Loading spinner, leading/trailing icons, block width
- `focus-visible:ring-2 focus-visible:ring-brand/40`
- `:active` tactile feedback via `scale-[0.98]` or `translate-y-[-1px]`

### Badge
- Tones: neutral, slate, brand, grn, amb, red
- `StatusBadge` auto-maps DB enum values → tone + label
- Sizes: sm (20px), md (24px)
- Optional leading dot in tone color

### Table
- Sticky slate header, hairline rows, hover tint on interactive rows
- Right-aligned monospace numeric cells
- Wrapped in overflow-x-auto container

### Form fields
- Label above input (`gap-2` block)
- Error text below input
- Helper text optional but present in markup

### Empty state
- Icon circle + title + description + optional action button
- Tone `error` for failed loads vs tone `default` for no data

### Loading states
- Skeleton blocks with `animate-pulse` matching the layout dimensions
- `SkeletonText` / `SkeletonRows` for common patterns

---

## 6. Motion & Animation

At Motion Intensity 6 (Fluid CSS):

- **Default transition:** `transition-colors` for color-only changes, `transition-all` with `duration-150 ease-out` for layout shifts.
- **Spring physics** for overlays (`cubic-bezier(0.16, 1, 0.3, 1)` — the "spring-lite" curve used in `nb-pop`).
- **Staggered reveals:** Use `animation-delay` cascades via CSS custom properties (`--i`) for sequential load-in of grid items. Data-dependent staggered mount uses the stagger approach (parent orchestrator in a client component).
- **Perpetual micro-interactions:** One active element per screen (e.g., a "live" status dot, a shimmering data ticker, a pulsing notification badge).
- **Layout transitions:** Use Framer Motion `layout`/`layoutId` for smooth reordering.
- **Performance:** Animate only `transform` and `opacity`. Never `top`, `left`, `width`, `height`. Isolate CPU-heavy animations in their own Client Components.

Defined keyframes (via `globals.css`):
- `nb-fade` — 0.14s ease-out opacity
- `nb-pop` — 0.16s spring-lite scale-up + translate

---

## 7. Data Visualisation

- **Metrics:** Large mono value, eyebrow label, delta line (coloured by tone), optional 3px progress bar.
- **Progress bar:** 3px height, `rounded` track (`bg-line`), tone-coloured fill (`bg-grn|amb|brand|red`). Width set inline as a percentage.
- **Compact money:** ₹1.84L / ₹6.43Cr / ₹9,900 (Indian lakh/crore scale, no K/M/B).
- **Numbers:** Indian grouping (en-IN). Monospace + tabular-nums.
- **Timestamps:** UTC storage, Asia/Kolkata display. `dateIST` / `dateTimeIST` formatters.
- **Data policy:** Every widget reads from Supabase RPCs through the typed data layer under RLS. Where a module does not exist yet, render an honest `EmptyState` with "Pending module" rather than mock data.

---

## 8. Data Layer Structure

```
lib/data/
├── fy.ts              — getCurrentFy()
├── accounting.ts      — getArAging(), summariseArAging()
├── notifications.ts   — getRecentNotifications()
├── licenses.ts        — getLicensesDue(), partitionLicenses()
├── auth/session.ts    — getSession()
├── auth/claims.ts     — AppClaims, can(), isActive()
└── auth/phone.ts      — formatDisplay()
```

All data functions are async server functions that call Supabase RPCs. They are callable directly from Server Components — no API routes or client-side data fetching for initial page loads.

Each RPC is a Postgres function with `security definer` that runs RLS checks as the signed-in user via `auth.uid()`.

---

## 9. Navigation

Grouped sidebar nav with permission gating:

```
Overview         Dashboard, Notifications
Sell & Collect   Sales Desk, Order Book, Invoicing, Collections, Credit Notes
Buy & Stock      Suppliers, Purchase/GRN/Bills, Item Master, Warehouse Stock, Rate Master
Manufacturing    BOM/Recipes, Production Runs, Process Costing
Accounting       Journal, Trial Balance, P&L/Balance Sheet, Bank Reconciliation
Field & People   Routes & Visits, Vehicles & Fuel, CRM, Targets, Payroll
Admin            Users & Access, Audit Log, Licence Register, Company Settings
```

Each item has a `perm` code matching `has_permission()` in Postgres. Items the user's claims don't satisfy are hidden. Badge keys tie to live count signals.

---

## 10. Prohibited Patterns

- No emojis in code, markup, text, or alt text — use inline SVGs or Radix/Phosphor icons.
- No neon/outer glows — use inner borders or tinted shadows.
- No pure `#000000`.
- No purple/blue accent — single cyan-600 only.
- No oversaturated accents — all colours below 80% saturation.
- No 3-column equal card layouts — use asymmetric grids or split layouts.
- No `h-screen` or `h-dvh` — always `min-h-[100dvh]`.
- No flexbox percentage math — use CSS Grid.
- No generic names, fake numbers, or startup slop names.
- No Inter in premium/creative contexts (acceptable for dashboard UIs).
- No Unsplash URLs — use `picsum.photos/seed/{id}` or null.
