// Shared primitives for the property-analyze result sections.
//
// Redesigned (2026-06) into a single premium surface vocabulary so every
// result section inherits the modern look without per-file edits. The public
// API (Section / VerdictBadge / SourcePill / krw / pct) is unchanged.

const B = 1_000_000_000;

export function krw(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `₩${(v / B / 1000).toFixed(d)}T`;
  if (Math.abs(v) >= B) return `₩${(v / B).toFixed(d)}B`;
  if (Math.abs(v) >= 1_000_000) return `₩${(v / 1_000_000).toFixed(d)}M`;
  return `₩${Math.round(v).toLocaleString()}`;
}

export function pct(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(d)}%`;
}

export function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const shell =
    'rounded-3xl border border-white/[0.07] bg-[#0e1422]/70 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm tabular-nums';
  const heading = (
    <span className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-slate-100">
      <span
        className="h-4 w-1 rounded-full bg-gradient-to-b from-sky-400 to-cyan-300"
        aria-hidden
      />
      {title}
    </span>
  );
  if (collapsible) {
    return (
      <section className={shell}>
        <details open={defaultOpen} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-3xl px-6 py-5 transition-colors hover:bg-white/[0.02]">
            {heading}
            <span
              className="text-xs text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="px-6 pb-6">{children}</div>
        </details>
      </section>
    );
  }
  return (
    <section className={`${shell} p-6`}>
      <div className="mb-4">{heading}</div>
      {children}
    </section>
  );
}

export function VerdictBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
    BUY: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/25',
    CONDITIONAL: 'bg-amber-400/12 text-amber-200 ring-amber-400/30',
    PASS: 'bg-rose-400/12 text-rose-200 ring-rose-400/30',
    AVOID: 'bg-rose-500/15 text-rose-100 ring-rose-500/40'
  };
  const label: Record<string, string> = {
    STRONG_BUY: 'STRONG BUY',
    BUY: 'BUY',
    CONDITIONAL: 'CONDITIONAL',
    PASS: 'PASS',
    AVOID: 'AVOID'
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] ring-1 ${styles[tier] ?? 'bg-white/10 text-slate-100 ring-white/20'}`}
    >
      {label[tier] ?? tier}
    </span>
  );
}

const TIER_STYLE: Record<string, string> = {
  LIVE: 'bg-emerald-400/12 text-emerald-200 ring-emerald-400/25',
  SEED: 'bg-sky-400/12 text-sky-200 ring-sky-400/25',
  IMPUTED: 'bg-amber-400/12 text-amber-200 ring-amber-400/25',
  FALLBACK: 'bg-rose-400/12 text-rose-200 ring-rose-400/25',
  MOCK: 'bg-rose-500/15 text-rose-100 ring-rose-500/30'
};

export function SourcePill({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ${
        TIER_STYLE[tier] ?? 'bg-white/10 text-slate-100 ring-white/20'
      }`}
    >
      {tier}
    </span>
  );
}
