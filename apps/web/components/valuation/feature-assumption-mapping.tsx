import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { FeatureAssumptionMappingRow } from '@/lib/services/valuation/feature-assumption-mapping';
import { formatNumber, toSentenceCase } from '@/lib/utils';

function toneForMode(mode: string | null) {
  if (!mode) return 'neutral' as const;
  if (mode.toLowerCase() === 'api') return 'good' as const;
  if (mode.toLowerCase() === 'fallback') return 'warn' as const;
  return 'neutral' as const;
}

export function FeatureAssumptionMapping({ rows }: { rows: FeatureAssumptionMappingRow[] }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow">Feature To Valuation Mapping</div>
        <Badge>{formatNumber(rows.length, 0)} links</Badge>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4 text-sm text-[hsl(var(--foreground-muted))]">
          No promoted feature-to-assumption mappings were resolved for this valuation run.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <div
              key={`${row.snapshotId}-${row.featureKey}-${row.targetPath}-${index}`}
              className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {row.featureLabel}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                    {toSentenceCase(row.namespace)} / {row.featureKey}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{row.targetKind}</Badge>
                  {row.mode ? <Badge tone={toneForMode(row.mode)}>{row.mode}</Badge> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                    Feature Value
                  </div>
                  <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                    {row.featureValue}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                    {row.targetLabel}
                  </div>
                  <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                    {row.appliedValue}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                    Trace
                  </div>
                  <div className="mt-2 text-sm text-[hsl(var(--foreground))]">{row.targetPath}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted))]">
                    {row.freshnessLabel ?? row.sourceVersion ?? 'current run snapshot'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
