import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <SkeletonText className="h-7 w-56" />

      <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
        {["Attendance Dashboard", "Workers", "Settings"].map((tab) => (
          <div key={tab} className="px-4 py-2.5">
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full lg:w-80">
          <Skeleton className="h-[320px] w-full rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
