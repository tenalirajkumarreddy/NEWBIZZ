// =====================================================================
// lib/supabase/server.ts — server Supabase client (Server Components, Route
// Handlers, Server Actions). Reads/writes the auth cookies via next/headers.
//
// In a Server Component the cookie store is read-only; the try/catch swallows
// the write attempt because middleware.ts is what actually refreshes and
// persists the session cookie on each request.
// =====================================================================
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Shape of a single cookie the ssr client asks us to persist.
type CookieToSet = { name: string; value: string; options: CookieOptions };

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — writes are handled in middleware.
          }
        },
      },
    },
  );
}
