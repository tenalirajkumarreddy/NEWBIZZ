// =====================================================================
// lib/data/badges.ts — live sidebar badge counts, computed once per layout
// render. Each count is gated by the permission of the nav item it feeds, so
// a user who cannot open a page never sees (nor pays for) its badge.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { can, type AppClaims } from "@/lib/auth/claims";
import { getUnreadCount } from "./notifications";
import { getLicensesDue } from "./licenses";

export type NavBadges = {
  unread: number;
  openOrders: number;
  licensesDue: number;
};

export async function getNavBadges(claims: AppClaims): Promise<NavBadges> {
  const supabase = createClient();

  const [unread, openOrders, licensesDue] = await Promise.all([
    getUnreadCount(),
    can(claims, "invoice.view") ? countOpenOrders(supabase) : 0,
    can(claims, "license.view") ? (await getLicensesDue()).length : 0,
  ]);

  return { unread, openOrders, licensesDue };
}

async function countOpenOrders(supabase: ReturnType<typeof createClient>): Promise<number> {
  const res = await supabase
    .from("sales_orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["confirmed", "approved"]);
  return res.error ? 0 : res.count ?? 0;
}
