import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  /**
   * Extra classes merged onto the wrapper. The corner radius and padding vary
   * slightly between call sites (`rounded-[18px] p-4`, `p-3`, `rounded-[22px]`,
   * `md:col-span-3`) so those are supplied here rather than baked into the
   * base, keeping each migrated site visually identical.
   */
  className?: string;
};

/**
 * The "No data yet" / "None recorded yet" placeholder tile that was hand-rolled
 * ~30 times across the admin pages. Base styling is the shared
 * `border border-white/10 bg-white/[0.03] text-sm text-slate-400` card; the
 * default `rounded-[18px] p-4` matches the most common standalone variant.
 */
export function EmptyState({ children, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400',
        className
      )}
    >
      {children}
    </div>
  );
}
