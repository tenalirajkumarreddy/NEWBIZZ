import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refresh the Supabase session + apply the route gate on every request except
// static assets and image optimization. Keeping _next and common asset file
// types out avoids needless Auth round-trips.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
