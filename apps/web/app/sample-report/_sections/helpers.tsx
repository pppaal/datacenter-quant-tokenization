// Local presentational helpers for the sample-report (Investment Memo) page.
//
// NOTE: `ProvenancePill` here is intentionally NOT the shared
// `@/components/ui/provenance-pill` export. The shared one renders a row of
// `SourceTierBadge`s keyed by tier, whereas this one renders the compact
// "Source <summary>" mono pill the IM uses. They are not visually equivalent,
// so this local version is kept to preserve identical rendered output.

import { classifyFreshness } from '@/lib/services/im/freshness';
import { summarizeProvenance } from '@/lib/services/im/provenance-map';

export function ProvenancePill({
  entries
}: {
  entries: Array<{ field: string; sourceSystem: string; mode: string; freshnessLabel: string }>;
}) {
  if (!entries || entries.length === 0) return null;
  const text = summarizeProvenance(entries);
  if (!text) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-1.5 text-[11px] text-slate-400">
      <span className="uppercase tracking-wide text-slate-500">Source</span>
      <span className="font-mono text-slate-300">{text}</span>
    </div>
  );
}

export function FreshnessDot({
  observedAt,
  label
}: {
  observedAt: Date | string | null | undefined;
  label?: string;
}) {
  const f = classifyFreshness(observedAt);
  if (!f.band) return null;
  const dotTone =
    f.band === 'fresh' ? 'bg-emerald-300' : f.band === 'recent' ? 'bg-amber-300' : 'bg-rose-300';
  const textTone =
    f.band === 'fresh'
      ? 'text-emerald-300'
      : f.band === 'recent'
        ? 'text-amber-300'
        : 'text-rose-300';
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]" title={`Observed ${f.label}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotTone}`} />
      <span className={textTone}>{label ?? f.label}</span>
    </span>
  );
}
