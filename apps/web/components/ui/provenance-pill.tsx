import { SourceTierBadge } from '@/components/ui/source-tier-badge';
import { cn } from '@/lib/utils';

/**
 * Summarise a set of provenance entries as a compact row of
 * `SourceTierBadge`s, one per distinct tier with its occurrence count.
 *
 * This consolidates the recurring "counts by tier" provenance readout. The
 * tier ordering is fixed (LIVE → SEED → IMPUTED → FALLBACK → MOCK) so the row
 * is stable regardless of entry order; tiers with no entries are omitted.
 *
 * The canonical inline provenance pills currently live in the
 * `sample-report` / `property-analyze` god-files (out of scope for this
 * refactor); those will adopt this primitive during their split.
 */

const TIER_ORDER = ['LIVE', 'SEED', 'IMPUTED', 'FALLBACK', 'MOCK'] as const;

export type ProvenanceTierEntry = { tier: string };

type Props = {
  entries: ProvenanceTierEntry[];
  className?: string;
  /** Render the per-tier count alongside the tier label. Defaults to true. */
  showCounts?: boolean;
};

export function ProvenanceSummary({ entries, className, showCounts = true }: Props) {
  if (!entries || entries.length === 0) return null;

  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.tier, (counts.get(entry.tier) ?? 0) + 1);
  }

  const knownOrder = new Map<string, number>(TIER_ORDER.map((tier, index) => [tier, index]));
  const tiers = Array.from(counts.keys()).sort((a, b) => {
    const ai = knownOrder.get(a) ?? TIER_ORDER.length;
    const bi = knownOrder.get(b) ?? TIER_ORDER.length;
    return ai === bi ? a.localeCompare(b) : ai - bi;
  });

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {tiers.map((tier) => (
        <SourceTierBadge
          key={tier}
          tier={tier}
          label={showCounts ? `${tier} ${counts.get(tier)}` : tier}
        />
      ))}
    </div>
  );
}

/** Alias kept for call sites that prefer the `*Pill` naming. */
export const ProvenancePill = ProvenanceSummary;
