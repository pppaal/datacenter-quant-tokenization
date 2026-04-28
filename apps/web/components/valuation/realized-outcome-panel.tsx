import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type { RealizedOutcomeComparison } from '@/lib/services/realized-outcomes';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

type OutcomeRow = {
  id: string;
  observationDate: Date;
  occupancyPct: number | null;
  noiKrw: number | null;
  rentGrowthPct: number | null;
  valuationKrw: number | null;
  debtServiceCoverage: number | null;
  exitCapRatePct: number | null;
  notes: string | null;
};

export function RealizedOutcomePanel({
  comparison,
  outcomes,
  displayCurrency,
  fxRateToKrw
}: {
  comparison: RealizedOutcomeComparison;
  outcomes: OutcomeRow[];
  displayCurrency: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Realized Outcomes</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Forecast vs actual asset path</h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            This is the first validation layer against actual occupancy, NOI, value, and DSCR after
            the underwriting run. It lets the macro team check whether regime overlays translated
            into realized asset results.
          </p>
        </div>
        <Badge tone={comparison.status === 'MATCHED' ? 'good' : 'neutral'}>
          {comparison.status === 'MATCHED' ? 'matched outcome' : 'waiting'}
        </Badge>
      </div>

      {comparison.status === 'MATCHED' && comparison.match ? (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Observed On</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {formatDate(comparison.match.observationDate)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {formatNumber(comparison.match.horizonDays, 0)} days after run
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Actual Value Move</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {comparison.match.actualValueChangePct === null
                  ? 'N/A'
                  : formatPercent(comparison.match.actualValueChangePct)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {comparison.match.valueForecastErrorPct === null
                  ? 'No forecast error yet.'
                  : `Forecast error ${formatPercent(comparison.match.valueForecastErrorPct)}`}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Actual DSCR Move</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {comparison.match.actualDscrChangePct === null
                  ? 'N/A'
                  : formatPercent(comparison.match.actualDscrChangePct)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {comparison.match.dscrForecastErrorPct === null
                  ? 'No DSCR forecast error yet.'
                  : `Forecast error ${formatPercent(comparison.match.dscrForecastErrorPct)}`}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Occupancy Gap</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {comparison.match.occupancyGapPct === null
                  ? 'N/A'
                  : formatPercent(comparison.match.occupancyGapPct)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Actual occupancy against the underwriting assumption.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="fine-print">Observed Snapshot</div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <div className="fine-print">Realized Value</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatCurrencyFromKrwAtRate(
                    comparison.match.valuationKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div>
                <div className="fine-print">Actual NOI</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatCurrencyFromKrwAtRate(
                    comparison.match.noiKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div>
                <div className="fine-print">Actual DSCR</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {comparison.match.debtServiceCoverage === null
                    ? 'N/A'
                    : `${formatNumber(comparison.match.debtServiceCoverage, 2)}x`}
                </div>
              </div>
              <div>
                <div className="fine-print">Rent Growth</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {comparison.match.rentGrowthPct === null
                    ? 'N/A'
                    : formatPercent(comparison.match.rentGrowthPct)}
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{comparison.commentary}</p>
            {comparison.match.notes ? (
              <p className="mt-3 text-sm leading-7 text-slate-400">{comparison.match.notes}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
          {comparison.commentary}
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {outcomes.length > 0 ? (
          outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">
                  {formatDate(outcome.observationDate)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {outcome.occupancyPct !== null ? (
                    <Badge>{formatPercent(outcome.occupancyPct)}</Badge>
                  ) : null}
                  {outcome.debtServiceCoverage !== null ? (
                    <Badge tone="neutral">{`${formatNumber(outcome.debtServiceCoverage, 2)}x DSCR`}</Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                <div>
                  <div className="fine-print">Value</div>
                  <div>
                    {formatCurrencyFromKrwAtRate(
                      outcome.valuationKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                </div>
                <div>
                  <div className="fine-print">NOI</div>
                  <div>
                    {formatCurrencyFromKrwAtRate(outcome.noiKrw, displayCurrency, fxRateToKrw)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Rent Growth</div>
                  <div>
                    {outcome.rentGrowthPct === null ? 'N/A' : formatPercent(outcome.rentGrowthPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Exit Cap</div>
                  <div>
                    {outcome.exitCapRatePct === null
                      ? 'N/A'
                      : formatPercent(outcome.exitCapRatePct)}
                  </div>
                </div>
              </div>
              {outcome.notes ? (
                <p className="mt-3 text-sm leading-7 text-slate-400">{outcome.notes}</p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
            No realized outcomes captured yet for this asset.
          </div>
        )}
      </div>
    </Card>
  );
}
