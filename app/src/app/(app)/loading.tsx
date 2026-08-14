import { PageContainer } from "@/components/ui";
import { Skeleton, SkeletonText, SkeletonRows } from "@/components/ui/Skeleton";

// Global route-level loading fallback for every (app) page that doesn't ship
// its own loading.tsx. Renders a header + CTA skeleton and a table so soft
// navigation shows structure instead of a frozen previous page.
export default function Loading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-7 w-56" />
          <SkeletonText lines={1} className="mt-2 w-72" />
        </div>
        <Skeleton className="h-8 w-24 self-start rounded-[7px]" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Skeleton className="h-3.5 w-32" />
        </div>
        <table className="w-full">
          <thead className="border-b border-line bg-fill/60">
            <tr className="text-left">
              {Array.from({ length: 4 }).map((_, i) => (
                <th key={i} className="px-3 py-2.5">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SkeletonRows rows={6} cols={4} />
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}