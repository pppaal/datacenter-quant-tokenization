import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-[18px] bg-[hsl(var(--surface-hover))]', className)} />
  );
}

export function MetricSkeleton() {
  return (
    <div className="metric-card">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-16" />
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-5 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-6 md:p-8">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
