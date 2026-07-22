// =====================================================================
// lib/supabase/client.ts — browser Supabase client (client components).
//
// RLS-scoped: uses the publishable/anon key. Everything it can do is bounded
// by the signed-in user's RLS policies + the SECURITY DEFINER RPCs.
// =====================================================================
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
