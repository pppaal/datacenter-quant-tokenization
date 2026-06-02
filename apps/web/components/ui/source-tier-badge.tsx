import { Badge } from '@/components/ui/badge';
import type { Tone } from '@/lib/ui/status-tone';

/**
 * Data-source provenance tier surfaced next to a value:
 *   - LIVE      — fetched from an authoritative live connector
 *   - SEED      — seeded / curated reference data
 *   - IMPUTED   — model-imputed / estimated
 *   - FALLBACK  — degraded fallback value
 *   - MOCK      — deterministic mock-mode value
 */
export type SourceTier = 'LIVE' | 'SEED' | 'IMPUTED' | 'FALLBACK' | 'MOCK';

/**
 * Canonical tier -> Badge tone mapping. This is the single source of truth
 * that the property-analyze / sample-report god-file split will adopt in
 * place of their independent `TIER_STYLE` (zinc palette `SourcePill`) and
 * `ProvenancePill` implementations. Tones reuse the app-wide slate/standard
 * `Badge` palette so the pill matches every other status chip in the product.
 */
const TIER_TONE: Record<string, Tone> = {
  LIVE: 'good',
  SEED: 'neutral',
  IMPUTED: 'warn',
  FALLBACK: 'danger',
  MOCK: 'danger'
};

type Props = {
  tier: string;
  /** Override the rendered text. Tone is still derived from `tier`. */
  label?: string;
  className?: string;
};

/**
 * A single provenance-tier badge. Unknown tiers fall back to the neutral tone
 * so callers can pass raw connector strings without a guard.
 */
export function SourceTierBadge({ tier, label, className }: Props) {
  return (
    <Badge tone={TIER_TONE[tier] ?? 'neutral'} className={className}>
      {label ?? tier}
    </Badge>
  );
}

/** Exposed for callers that need the tone without rendering the badge. */
export function sourceTierTone(tier: string): Tone {
  return TIER_TONE[tier] ?? 'neutral';
}
