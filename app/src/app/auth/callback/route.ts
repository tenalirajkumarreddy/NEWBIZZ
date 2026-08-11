import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) redirect target: exchange the code for a session, then
// bounce to `next`. A fresh Google sign-in whose email isn't linked to any
// phone account has no phone on the auth user — that's an orphan: delete both
// the auth + profile rows (cleanup_orphan_google_user) and send the user back
// to login with an explanation. Linking a Google identity to an existing
// phone account never hits this branch (phone is present).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Real identities sign up by phone; a Google-only auth has no phone.
      if (user.phone == null) {
        await supabase.rpc("cleanup_orphan_google_user");
        return NextResponse.redirect(`${origin}/login?google=unlinked`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
