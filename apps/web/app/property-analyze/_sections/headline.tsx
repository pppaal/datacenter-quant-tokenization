// Headline "bento" stat grid shown above the detailed result sections.
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'good' | 'warn' | 'danger' | 'accent';

const TONE_VALUE: Record<Tone, string> = {
  neutral: 'text-white',
  accent: 'text-cyan-300',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300'
};

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  span = 1
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  span?: 1 | 2;
}) {
  return (
    <div
      className={`${
        span === 2 ? 'sm:col-span-2' : ''
      } group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0e1422]/70 p-5 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm transition-colors hover:border-white/[0.12]`}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${TONE_VALUE[tone]}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-slate-400 tabular-nums">{sub}</div> : null}
    </div>
  );
}
