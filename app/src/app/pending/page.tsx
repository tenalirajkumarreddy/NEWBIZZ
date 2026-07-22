import { getSession } from "@/lib/auth/session";
import { formatDisplay } from "@/lib/auth/phone";

// Holding screen for signed-in users who are not 'active' (pending_review,
// suspended, disabled). They can log in but do nothing — the DB refuses every
// mutation anyway. Middleware routes them here.
export default async function PendingPage() {
  const session = await getSession();
  const status = session?.claims.user_status ?? "unknown";
  const phone = session?.user.phone ? formatDisplay(session.user.phone) : "";

  const copy: Record<string, { title: string; body: string }> = {
    pending_review: {
      title: "Your account is awaiting review",
      body: "An administrator needs to approve your access before you can use NEWBIZZ. You'll get a notification once you're approved.",
    },
    suspended: {
      title: "Your account is suspended",
      body: "Access has been temporarily disabled. Contact an administrator to restore it.",
    },
    disabled: {
      title: "Your account is disabled",
      body: "This account can no longer sign in to NEWBIZZ. Contact an administrator.",
    },
    unknown: {
      title: "Access not available",
      body: "Your account isn't active yet. Contact an administrator.",
    },
  };
  const c = copy[status] ?? copy.unknown;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-amb-wash font-mono text-xl font-bold text-amb">
          !
        </div>
        <h1 className="mt-5 text-[20px] font-bold text-ink">{c.title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{c.body}</p>
        {phone && (
          <p className="mt-4 font-mono text-[12px] text-ink-4">{phone}</p>
        )}
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="h-10 w-full rounded-lg border border-line bg-white text-[13px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:bg-fill"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
