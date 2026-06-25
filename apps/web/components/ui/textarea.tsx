import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-[120px] w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--foreground-faint))] focus:border-accent focus:bg-[hsl(var(--surface-hover))] focus:ring-2 focus:ring-accent/15',
        className
      )}
    />
  );
}
