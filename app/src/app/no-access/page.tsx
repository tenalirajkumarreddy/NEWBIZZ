import { getSession } from "@/lib/auth/session";
import { formatDisplay } from "@/lib/auth/phone";

// For signed-in active users who reached a route their roles can't open. Middleware
// redirects here (and the (app) layout re-checks the same rule server-side). This
// page lives OUTSIDE the (app) group so it never inherits the app shell — a user
// can always land here to see why and head back to their dashboard.
export default async function NoAccessPage() {
  const session = await getSession();
  const phone = session?.user.phone ? formatDisplay(session.user.phone) : "";

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-amb-wash font-mono text-xl font-bold text-amb">
          !
        </div>
        <h1 className="mt-5 text-[20px] font-bold text-ink">Access not granted</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          You signed in, but your role doesn&apos;t include this page. If you think
          this is a mistake, ask an administrator to update your access.
        </p>
        {phone && <p className="mt-4 font-mono text-[12px] text-ink-4">{phone}</p>}
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}