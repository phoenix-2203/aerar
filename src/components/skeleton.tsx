// Placeholder blocks shaped like the content they stand in for, so nothing jumps when data arrives.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden />;
}

export function ReportSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading the report">
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
