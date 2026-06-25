import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--foreground-faint))] focus:border-accent focus:bg-[hsl(var(--surface-hover))] focus:ring-2 focus:ring-accent/15',
        className
      )}
    />
  );
}
