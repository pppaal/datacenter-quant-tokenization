import type { HTMLAttributes } from 'react';
import { cn, toSentenceCase } from '@/lib/utils';

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
  label?: string;
};

export function Badge({ className, tone = 'neutral', label, children, ...props }: Props) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em]',
        tone === 'neutral' &&
          'border-border bg-[hsl(var(--panel-alt))] text-[hsl(var(--foreground-muted))]',
        tone === 'good' &&
          'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]',
        tone === 'warn' &&
          'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] text-[hsl(var(--warning))]',
        tone === 'danger' &&
          'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]',
        className
      )}
    >
      {label ? toSentenceCase(label) : children}
    </span>
  );
}
