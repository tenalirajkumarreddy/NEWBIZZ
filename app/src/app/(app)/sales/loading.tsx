import { PageContainer, PageHeader } from "@/components/ui";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

// Sales Desk loading state — mirrors the live layout: header with a desk CTA,
// a four-up KPI strip, then the "Recorded sales" register as a table skeleton.
export default function Loading() {
  return (
    <PageContainer>
      <PageHeader
        title={<Skeleton className="h-7 w-40" />}
        subtitle={<Skeleton className="mt-2 h-3.5 w-64" />}
        actions={<Skeleton className="h-8 w-28 self-start rounded-[7px]" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <table className="w-full">
          <thead className="border-b border-line bg-fill/60">
            <tr className="text-left">
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="px-3 py-2.5">
                  <Skeleton className="h-3 w-14" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SkeletonRows rows={6} cols={6} />
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}