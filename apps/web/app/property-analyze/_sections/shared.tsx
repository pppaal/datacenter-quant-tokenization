// Shared primitives for the property-analyze result sections.
//
// These were extracted verbatim from analyze-client.tsx during the structural
// split. The local `Section`, `VerdictBadge`, `SourcePill`/`TIER_STYLE` and the
// `krw`/`pct` formatters are kept local (rather than swapped for the app-wide
// `components/ui/section.tsx` / `SourceTierBadge`) because the canonical shared
// components render a visually different chrome:
//   - `ui/section.tsx` is a slate/white header block (eyebrow + title), not the
//     zinc bordered card / collapsible `<details>` used here.
//   - `SourceTierBadge` renders a standard `Badge` (tone palette), whereas the
//     local `SourcePill` uses the bespoke zinc/emerald/sky/amber/rose `[10px]`
//     pill. Adopting it would change the rendered look, so it is preserved.

const B = 1_000_000_000;

export function krw(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `${(v / B / 1000).toFixed(d)}T`;
  if (Math.abs(v) >= B) return `${(v / B).toFixed(d)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(d)}M`;
  return Math.round(v).toLocaleString();
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
  if (collapsible) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <details open={defaultOpen} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-lg font-semibold text-zinc-100 hover:bg-zinc-900/60">
            <span>{title}</span>
            <span
              className="text-xs text-zinc-500 group-open:rotate-180 transition-transform"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="px-5 pb-5">{children}</div>
        </details>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export function VerdictBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-600 text-emerald-50 border-emerald-400',
    BUY: 'bg-emerald-700/70 text-emerald-100 border-emerald-500',
    CONDITIONAL: 'bg-amber-600/70 text-amber-50 border-amber-400',
    PASS: 'bg-rose-700/70 text-rose-100 border-rose-500',
    AVOID: 'bg-rose-600 text-rose-50 border-rose-400'
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
      className={`inline-block rounded border px-3 py-1.5 text-sm font-bold tracking-wide ${styles[tier] ?? 'bg-zinc-700 text-zinc-100'}`}
    >
      {label[tier] ?? tier}
    </span>
  );
}

const TIER_STYLE: Record<string, string> = {
  LIVE: 'bg-emerald-700/60 text-emerald-100 border-emerald-500',
  SEED: 'bg-sky-700/50 text-sky-100 border-sky-500',
  IMPUTED: 'bg-amber-700/50 text-amber-100 border-amber-500',
  FALLBACK: 'bg-rose-700/50 text-rose-100 border-rose-500',
  MOCK: 'bg-rose-800/60 text-rose-100 border-rose-500'
};

export function SourcePill({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        TIER_STYLE[tier] ?? 'bg-zinc-700 text-zinc-100 border-zinc-500'
      }`}
    >
      {tier}
    </span>
  );
}
