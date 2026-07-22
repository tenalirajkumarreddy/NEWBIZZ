// =====================================================================
// lib/data/permissions.ts — live permission reads (source of truth).
//
// The JWT claims (perms/roles) are a cache for UI speed. When correctness
// matters — or to reconcile a possibly-stale token — these hit the DB directly:
//   get_my_permissions() -> string[] of permission codes for the caller
//   get_my_token_version() -> the live token_version to compare with the claim
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

/** The caller's live permission codes, straight from the DB (not the token). */
export async function getMyPermissions(): Promise<string[]> {
  const supabase = createClient();
  const res = await supabase.rpc("get_my_permissions");
  return unwrap(res, [] as string[], "getMyPermissions");
}

/** The live token_version; a client compares this to its cached claim (§2.5). */
export async function getMyTokenVersion(): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_token_version");
  if (error || typeof data !== "number") return null;
  return data;
}
