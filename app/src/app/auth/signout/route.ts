import { NextResponse, type NextRequest } from "next/server";
import { signOutAndGetDest } from "@/lib/auth/signOut";

// Sign out and return to the right login for the principal type. POST-only so a
// prefetch/GET can't log a user out.
export async function POST(request: NextRequest) {
  const dest = await signOutAndGetDest();
  return NextResponse.redirect(new URL(dest, request.url), { status: 303 });
}
