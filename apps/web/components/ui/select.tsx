import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-accent focus:bg-[hsl(var(--surface-hover))] focus:ring-2 focus:ring-accent/15',
        className
      )}
    >
      {children}
    </select>
  );
}
