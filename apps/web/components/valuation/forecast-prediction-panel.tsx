import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import {
  buildForecastDecisionNarrative,
  type ForecastDecisionGuide
} from '@/lib/services/forecast/decision';
import type { GradientBoostingForecast } from '@/lib/services/forecast/gradient-boosting';
import { formatNumber, formatPercent } from '@/lib/utils';

export function ForecastPredictionPanel({
  forecast,
  decisionGuide,
  displayCurrency,
  fxRateToKrw
}: {
  forecast: GradientBoostingForecast | null;
  decisionGuide: ForecastDecisionGuide | null;
  displayCurrency: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  if (!forecast) return null;
  const readingGuide = buildForecastDecisionNarrative(decisionGuide);

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Boosted Forecast</div>
          <h3 className="mt-2 text-xl font-semibold text-white">12-Month ML Drift View</h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Lightweight gradient boosting on historical valuation paths. This is a learned forecast
            layer, separate from the deterministic scenario and Monte Carlo screens.
          </p>
        </div>
        <Badge tone={forecast.status === 'READY' ? 'good' : 'warn'}>
          {forecast.status === 'READY' ? 'ready' : 'data gap'}
        </Badge>
      </div>

      {readingGuide ? (
        <div className="mt-5 rounded-[24px] border border-accent/20 bg-accent/10 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">{readingGuide.leadLabel}</Badge>
            <Badge>{readingGuide.leadModelKey}</Badge>
            {readingGuide.challengerModelKey ? (
              <Badge tone="neutral">{readingGuide.challengerModelKey}</Badge>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
            <p>{readingGuide.leadSentence}</p>
            <p>{readingGuide.constraintSentence}</p>
            <p>{readingGuide.downsideSentence}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Training pairs</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(forecast.sampleCount, 0)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {formatNumber(forecast.assetCoverage, 0)} assets with sequential history.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Value Drift</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {forecast.predictedValueChangePct === null
              ? 'N/A'
              : formatPercent(forecast.predictedValueChangePct)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {forecast.forecastHorizonMonths}-month predicted change.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Predicted Value</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {forecast.predictedValueKrw === null
              ? 'N/A'
              : formatCurrencyFromKrwAtRate(
                  forecast.predictedValueKrw,
                  displayCurrency,
                  fxRateToKrw
                )}
          </div>
          <p className="mt-2 text-sm text-slate-400">Model-implied next horizon valuation.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Predicted DSCR</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {forecast.predictedDscr === null
              ? 'N/A'
              : `${formatNumber(forecast.predictedDscr, 2)}x`}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {forecast.predictedDscrChangePct === null
              ? 'Not enough data.'
              : `${formatPercent(forecast.predictedDscrChangePct)} drift`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Model Note</div>
          <p className="mt-3 text-sm leading-7 text-slate-300">{forecast.commentary}</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Top Drivers</div>
          <div className="mt-3 space-y-2">
            {forecast.topDrivers.length > 0 ? (
              forecast.topDrivers.map((driver) => (
                <div
                  key={driver.featureKey}
                  className="flex items-center justify-between gap-3 text-sm text-slate-300"
                >
                  <span>{driver.label}</span>
                  <span className={driver.contribution < 0 ? 'text-amber-300' : 'text-emerald-300'}>
                    {driver.contribution > 0 ? '+' : ''}
                    {formatNumber(driver.contribution, 2)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">
                More sequential valuation history is needed before feature attribution becomes
                meaningful.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
