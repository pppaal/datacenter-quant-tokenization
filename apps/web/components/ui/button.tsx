import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ className, variant = 'primary', ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-[-0.01em] transition duration-200',
        variant === 'primary' &&
          'bg-accent text-[hsl(var(--on-accent))] shadow-sm hover:-translate-y-0.5 hover:bg-[hsl(var(--accent-hover))] disabled:translate-y-0 disabled:bg-[hsl(var(--border-strong))] disabled:text-[hsl(var(--muted))] disabled:shadow-none',
        variant === 'secondary' &&
          'border border-border bg-panel text-foreground shadow-xs hover:-translate-y-0.5 hover:border-[hsl(var(--accent))] hover:bg-[hsl(var(--accent-tint))]',
        variant === 'ghost' &&
          'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-hover))] hover:text-foreground',
        className
      )}
    />
  );
}
