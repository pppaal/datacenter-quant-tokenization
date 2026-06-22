import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ValuationRunBadges } from '@/components/valuation/valuation-run-badges';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatDate, formatNumber } from '@/lib/utils';
import { getRunSpreadRatio } from '@/lib/services/valuation/run-health';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type ScenarioEntry = {
  id: string;
  name: string;
  valuationKrw: number;
};

type RunRow = {
  id: string;
  runLabel: string;
  createdAt: Date | string;
  engineVersion: string;
  confidenceScore: number;
  baseCaseValueKrw: number;
  provenance: unknown;
  scenarios: ScenarioEntry[];
};

export function ValuationHistoryTable({
  runs,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  runs: RunRow[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-6 py-4">
        <div className="eyebrow">Valuation History</div>
        <div className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
          Recent run comparison and re-run status.
        </div>
      </div>
      <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.7fr_0.9fr] gap-4 border-b border-border px-6 py-4 text-xs uppercase tracking-[0.24em] text-[hsl(var(--muted))]">
        <div>Run</div>
        <div>Base Case</div>
        <div>Confidence</div>
        <div>Spread</div>
        <div>Status</div>
      </div>
      {runs.map((run) => {
        const provenance = Array.isArray(run.provenance)
          ? (run.provenance as ProvenanceEntry[])
          : [];
        const spreadRatio = getRunSpreadRatio(run.scenarios);

        return (
          <Link
            key={run.id}
            href={`/admin/valuations/${run.id}`}
            className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.7fr_0.9fr] gap-4 border-b border-border/70 px-6 py-5 text-sm text-[hsl(var(--foreground-muted))] transition hover:bg-[hsl(var(--surface-hover))]"
          >
            <div>
              <div className="font-semibold text-[hsl(var(--foreground))]">{run.runLabel}</div>
              <div className="mt-2 text-xs text-[hsl(var(--muted))]">
                {formatDate(run.createdAt)} / {run.engineVersion}
              </div>
            </div>
            <div>
              {formatCurrencyFromKrwAtRate(run.baseCaseValueKrw, displayCurrency, fxRateToKrw)}
            </div>
            <div>{formatNumber(run.confidenceScore, 1)}</div>
            <div>{spreadRatio !== null ? `${formatNumber(spreadRatio * 100, 1)}%` : 'N/A'}</div>
            <div>
              <ValuationRunBadges
                createdAt={run.createdAt}
                confidenceScore={run.confidenceScore}
                provenance={provenance}
                scenarios={run.scenarios}
              />
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
