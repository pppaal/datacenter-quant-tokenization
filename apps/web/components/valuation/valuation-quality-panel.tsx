import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { buildValuationQualitySummary } from '@/lib/valuation-quality';
import { formatNumber } from '@/lib/utils';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type Props = {
  asset: {
    leases?: Array<unknown> | null;
    capexLineItems?: Array<unknown> | null;
    comparableSet?: { entries?: Array<unknown> | null } | null;
    energySnapshot?: { tariffKrwPerKwh?: number | null; pueTarget?: number | null } | null;
    permitSnapshot?: { powerApprovalStatus?: string | null } | null;
    ownershipRecords?: Array<unknown> | null;
    encumbranceRecords?: Array<unknown> | null;
    planningConstraints?: Array<unknown> | null;
  };
  assumptions: unknown;
  provenance?: ProvenanceEntry[];
};

export function ValuationQualityPanel({ asset, assumptions, provenance = [] }: Props) {
  const summary = buildValuationQualitySummary(asset, assumptions, provenance);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Valuation Quality</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            Coverage, gaps, and source pressure
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={summary.sourceStats.fallbackCount > 0 ? 'warn' : 'good'}>
            {summary.sourceStats.fallbackCount} fallback
          </Badge>
          <Badge tone={summary.sourceStats.apiCount > 0 ? 'good' : 'neutral'}>
            {summary.sourceStats.apiCount} api
          </Badge>
          <Badge>{summary.featureSources.length} feature sources</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {summary.coverage.map((item) => (
          <div key={item.key} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{item.label}</div>
              <Badge tone={item.status}>{item.status}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">Top Missing Inputs</div>
          {summary.missingInputs.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-300">
              Core lease, comparable, CAPEX, power, permit, and legal inputs are all present.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm text-slate-300">
              {summary.missingInputs.map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">Active Feature Sources</div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {formatNumber(summary.featureSources.length, 0)} attached
            </div>
          </div>
          {summary.featureSources.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No promoted feature snapshots were attached to this valuation run.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {summary.featureSources.map((source) => (
                <div
                  key={`${source.namespace}-${source.sourceVersion}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{source.label}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {source.namespace}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{source.sourceVersion}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
