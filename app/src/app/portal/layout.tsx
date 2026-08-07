import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPortalPrincipal } from "@/lib/auth/claims";
import { formatDisplay } from "@/lib/auth/phone";
import { PortalHeader } from "@/components/portal/PortalHeader";

// Portal shell. Defence-in-depth on top of middleware: a signed-out visitor or a
// non-portal principal is bounced; a real portal principal gets the lean header.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/portal/login");
  if (!isPortalPrincipal(session.claims)) redirect("/login");

  const { user } = session;
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PortalHeader phone={user.phone ? formatDisplay(user.phone) : "Portal"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}