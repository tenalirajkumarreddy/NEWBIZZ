// =====================================================================
// lib/auth/route-guard.ts — central route → permission map for the app.
//
// The Sidebar (nav.ts) already hides links users can't use, but a link is only
// UX: nothing stopped someone from TYPING /challans or following a stale URL and
// the page rendered. This module is that gap-closer — a single authoritative
// route→permission table the whole app shares:
//
//   * middleware (lib/supabase/middleware.ts) redirects to /no-access on entry
//   * the (app) layout re-checks the same rule server-side (defence in depth)
//
// Matching is prefix-based and LONGEST-FIRST, so "/credit-notes" wins over
// "/credit" and "/admin/whatsapp" wins over "/whatsapp". Routes with no rule
// (dashboard, notifications, documents, holdings, /no-access itself) are open
// to any active user.
//
// UI gate only — mutations still pass through permission-checked RPCs (RLS).
// =====================================================================

import { type AppClaims, can } from "@/lib/auth/claims";

interface RouteRule {
  prefix: string;
  /** Permission code required for every path under this prefix. */
  perm?: string;
  /**
   * Alternative: open to any user holding one of these role codes (admin always
   * passes via is_admin). Used when a page is shared by roles that don't all
   * carry a single permission code (e.g. /admin/users for admin + manager).
   */
  roles?: string[];
  /** ANY-match alternative: holds if the user holds ANY of these permission codes
   *  (admin always passes). Used when a route has no single code every role
   *  shares (e.g. the Sales Desk register: invoice.view OR cashmemo.view). */
  anyOf?: string[];
}

// Longest prefixes first so more specific routes beat their parents.
const RULES: RouteRule[] = [
  { prefix: "/admin/production-devices", perm: "settings.manage" },
  { prefix: "/admin/whatsapp", perm: "settings.manage" },
  { prefix: "/admin/settings", perm: "settings.manage" },
  { prefix: "/admin/licenses", perm: "license.view" },
  { prefix: "/admin/audit", perm: "audit.view" },
  { prefix: "/admin/users/roles", perm: "roles.manage" },
  { prefix: "/admin/releases", perm: "release.manage" },
  { prefix: "/admin/users", roles: ["manager"] },
  { prefix: "/credit-notes", perm: "creditnote.view" },
  { prefix: "/trial-balance", perm: "report.trial_balance" },
  { prefix: "/purchasing", perm: "purchase.view" },
  { prefix: "/commissions", perm: "commission.view" },
  { prefix: "/production", perm: "production.run" },
  { prefix: "/customers", perm: "customer.manage" },
  { prefix: "/suppliers", perm: "supplier.view" },
  { prefix: "/receipts", perm: "receipt.record" },
  { prefix: "/challans", perm: "challan.view" },
  { prefix: "/payroll", perm: "hr.view" },
  { prefix: "/expenses", perm: "accounting.manage" },
  { prefix: "/invoices", perm: "invoice.view" },
  { prefix: "/vouchers", perm: "journal.post" },
  { prefix: "/journal", perm: "journal.view" },
  { prefix: "/reports", perm: "report.pnl" },
  { prefix: "/assets", perm: "accounting.manage" },
  { prefix: "/loans", perm: "accounting.manage" },
  { prefix: "/bank", perm: "bank.reconcile" },
  { prefix: "/gst", perm: "report.gst" },
  { prefix: "/costing", perm: "report.costing" },
  { prefix: "/fleet", perm: "field.view" },
  { prefix: "/routes", perm: "field.view" },
  { prefix: "/crm", perm: "crm.view" },
  { prefix: "/stock", perm: "stock.view" },
  { prefix: "/items", perm: "item.view" },
  { prefix: "/pricing", perm: "pricing.manage" },
  { prefix: "/bom", perm: "bom.view" },
  { prefix: "/sales/receipt", perm: "cashmemo.create" },
  { prefix: "/sales/new", anyOf: ["invoice.create", "cashmemo.create"] },
  { prefix: "/sales", anyOf: ["invoice.view", "cashmemo.view"] },
  { prefix: "/orders", perm: "order.view" },
  { prefix: "/credit", perm: "customer.manage" },
  { prefix: "/whatsapp", perm: "customer.manage" },
];

/** Route an unsigned-in user lands on when they lack access to a page. */
export const NO_ACCESS_PATH = "/no-access";

/**
 * True when the claims may open this path. Admin short-circuits via can();
 * paths with no rule are open to any active user.
 */
export function canAccessPath(claims: AppClaims, pathname: string): boolean {
  const rule = RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!rule) return true;
  if (rule.roles) {
    return claims.is_admin || claims.roles.some((r) => rule.roles!.includes(r));
  }
  if (rule.anyOf) return hasAny(claims, rule.anyOf);
  if (rule.perm) return can(claims, rule.perm);
  return true;
}

/** ANY-match helper: admin passes, or any listed code grants access. */
function hasAny(claims: AppClaims, perms: string[]): boolean {
  return perms.some((p) => can(claims, p));
}