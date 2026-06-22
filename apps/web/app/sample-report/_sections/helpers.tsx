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
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-1.5 text-[11px] text-[hsl(var(--foreground-muted))]">
      <span className="uppercase tracking-wide text-[hsl(var(--muted))]">Source</span>
      <span className="font-mono text-[hsl(var(--foreground-muted))]">{text}</span>
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
    f.band === 'fresh'
      ? 'bg-[hsl(var(--success))]'
      : f.band === 'recent'
        ? 'bg-[hsl(var(--warning))]'
        : 'bg-[hsl(var(--danger))]';
  const textTone =
    f.band === 'fresh'
      ? 'text-[hsl(var(--success))]'
      : f.band === 'recent'
        ? 'text-[hsl(var(--warning))]'
        : 'text-[hsl(var(--danger))]';
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]" title={`Observed ${f.label}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotTone}`} />
      <span className={textTone}>{label ?? f.label}</span>
    </span>
  );
}
