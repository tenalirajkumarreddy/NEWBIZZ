"use client";

import { PageContainer } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

// Global error boundary for every (app) page. Toplevel so any thrown read in a
// server component surfaces a calm, branded recovery panel (with Retry) instead
// of Next's bare dev overlay.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <PageContainer>
      <div className="border border-line bg-surface shadow-card">
        <EmptyState
          tone="error"
          title="Something went wrong"
          description={
            <>
              This section hit an unexpected error. Your data is safe — try again, or reload the
              page.
              {isDev && error.message && (
                <span className="mt-2 block break-words font-mono text-[11px] text-red-700">
                  {error.message}
                </span>
              )}
            </>
          }
          action={
            <Button variant="primary" size="sm" onClick={() => reset()}>
              Retry
            </Button>
          }
        />
      </div>
    </PageContainer>
  );
}