import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { FeatureAssumptionMappingRow } from '@/lib/valuation/feature-assumption-mapping';
import { formatNumber, toSentenceCase } from '@/lib/utils';

function toneForMode(mode: string | null) {
  if (!mode) return 'neutral' as const;
  if (mode.toLowerCase() === 'api') return 'good' as const;
  if (mode.toLowerCase() === 'fallback') return 'warn' as const;
  return 'neutral' as const;
}

export function FeatureAssumptionMapping({
  rows
}: {
  rows: FeatureAssumptionMappingRow[];
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow">Feature To Valuation Mapping</div>
        <Badge>{formatNumber(rows.length, 0)} links</Badge>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          No promoted feature-to-assumption mappings were resolved for this valuation run.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <div key={`${row.snapshotId}-${row.featureKey}-${row.targetPath}-${index}`} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{row.featureLabel}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {toSentenceCase(row.namespace)} / {row.featureKey}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{row.targetKind}</Badge>
                  {row.mode ? <Badge tone={toneForMode(row.mode)}>{row.mode}</Badge> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Feature Value</div>
                  <div className="mt-2 text-sm text-white">{row.featureValue}</div>
                </div>
                <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{row.targetLabel}</div>
                  <div className="mt-2 text-sm text-white">{row.appliedValue}</div>
                </div>
                <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Trace</div>
                  <div className="mt-2 text-sm text-white">{row.targetPath}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.freshnessLabel ?? row.sourceVersion ?? 'current run snapshot'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
