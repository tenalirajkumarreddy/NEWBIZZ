"use server";

import { globalSearch } from "@/lib/data/search";

// =====================================================================
// Global search action (F7). Thin wrapper so the client palette can call
// the RLS-scoped reader. Returns a flat list of hits; each hit carries
// the entity kind, display text, and the route to jump to.
// =====================================================================

export async function searchEverything(query: string) {
  return globalSearch(query);
}
