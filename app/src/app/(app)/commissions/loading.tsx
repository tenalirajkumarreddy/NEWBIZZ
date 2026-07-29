import { Skeleton, SkeletonText, SkeletonRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <SkeletonText className="h-7 w-64" />
        <SkeletonText className="mt-1 h-4 w-96" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <SkeletonText className="h-3 w-20" />
            <SkeletonText className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-card">
        <div className="border-b border-line px-4 py-3">
          <SkeletonText className="h-4 w-40" />
        </div>
        <div className="p-4">
          <SkeletonRows rows={4} />
        </div>
      </div>
    </div>
  );
}
