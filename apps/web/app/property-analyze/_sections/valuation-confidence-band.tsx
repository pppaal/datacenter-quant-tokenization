import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw, pct } from './shared';

const LABEL_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  low: 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
};

const QUALITY_LABEL: Record<string, string> = {
  robust: 'Robust',
  fair: 'Fair',
  sparse: 'Sparse'
};

export function ValuationConfidenceBandSection({ band }: { band: any }) {
  if (!band) return null;
  const labelStyle = LABEL_STYLE[band.confidenceLabel] ?? LABEL_STYLE.medium;
  return (
    <Section title="Valuation confidence band">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${labelStyle}`}
        >
          {`${band.confidenceLabel} confidence`}
        </span>
        <span className="text-xs text-slate-400">
          {`comparables: ${QUALITY_LABEL[band.comparableQuality] ?? band.comparableQuality} (${band.comparableCount})`}
        </span>
      </div>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Value range (low — high)"
      >
        {`${krw(band.lowValueKrw)} — ${krw(band.highValueKrw)} KRW`}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Band half-width"
      >
        {`± ${pct(band.bandHalfWidthPct * 100)}`}
      </KeyValueRow>
      {band.comparableDispersionCv != null && (
        <KeyValueRow
          variant="divider"
          className="border-t py-1.5 text-sm first:border-t-0"
          label="Comp cap-rate dispersion (CV)"
        >
          {pct(band.comparableDispersionCv * 100)}
        </KeyValueRow>
      )}
      {Array.isArray(band.drivers) && band.drivers.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          {band.drivers.map((d: string, i: number) => (
            <li key={i}>• {d}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{band.method}</p>
    </Section>
  );
}
