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
        tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-slate-300',
        tone === 'good' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'danger' && 'border-rose-500/30 bg-rose-500/10 text-rose-300',
        className
      )}
    >
      {label ? toSentenceCase(label) : children}
    </span>
  );
}
