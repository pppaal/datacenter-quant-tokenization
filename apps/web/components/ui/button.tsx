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
          'glow-ring bg-accent text-slate-950 hover:-translate-y-0.5 hover:bg-cyan-300 disabled:translate-y-0 disabled:bg-slate-700 disabled:text-slate-400',
        variant === 'secondary' &&
          'border border-white/12 bg-white/[0.04] text-slate-100 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]',
        variant === 'ghost' && 'text-slate-300 hover:bg-white/5 hover:text-white',
        className
      )}
    />
  );
}
