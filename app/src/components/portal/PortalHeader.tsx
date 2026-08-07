import Link from "next/link";

// Top bar for the portal: brand, account hint, sign out. Deliberately lean —
// no internal sidebar, no role/permission surface.
export function PortalHeader({ phone }: { phone: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/portal" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-mono text-[15px] font-bold text-white">
            N
          </div>
          <span className="text-[17px] font-bold tracking-tight text-ink">
            NEWBIZZ<span className="text-brand">.</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[12px] text-ink-3 sm:inline">{phone}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:bg-fill hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}