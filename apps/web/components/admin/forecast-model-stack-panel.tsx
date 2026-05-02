import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ForecastModelStack } from '@/lib/services/forecast/model-stack';
import { formatNumber } from '@/lib/utils';

function toneForStatus(status: string) {
  if (status === 'LIVE') return 'good' as const;
  if (status === 'READY') return 'good' as const;
  if (status === 'BUILDING') return 'neutral' as const;
  return 'warn' as const;
}

function toneForConfidence(confidenceBand: string) {
  if (confidenceBand === 'HIGH') return 'good' as const;
  if (confidenceBand === 'MEDIUM') return 'neutral' as const;
  if (confidenceBand === 'LOW') return 'warn' as const;
  return 'neutral' as const;
}

export function ForecastModelStackPanel({ stack }: { stack: ForecastModelStack }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Forecast Stack</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Beyond Monte Carlo</h2>
        </div>
        <Badge tone={stack.summary.liveModels > 0 ? 'good' : 'neutral'}>
          {formatNumber(stack.summary.liveModels, 0)} live /{' '}
          {formatNumber(stack.summary.buildableModels, 0)} building
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          ['Markets', formatNumber(stack.features.marketCount, 0), 'Active macro markets'],
          [
            'Valuation paths',
            formatNumber(stack.features.valuationHistoryCount, 0),
            'Stored underwriting runs'
          ],
          [
            'Macro obs',
            formatNumber(stack.features.macroObservationCount, 0),
            'Persisted factor rows'
          ],
          [
            'Financials',
            formatNumber(stack.features.financialStatementCount, 0),
            'Counterparty statement histories'
          ]
        ].map(([label, value, subline]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="fine-print">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
            <p className="mt-2 text-sm text-slate-400">{subline}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {stack.models.map((model) => (
          <div
            key={model.key}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">{model.label}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                  #{model.ranking} / {model.family} / {model.cadence}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={toneForStatus(model.status)}>{model.status.toLowerCase()}</Badge>
                <Badge tone={toneForConfidence(model.confidenceBand)}>
                  {model.confidenceBand.toLowerCase()}
                </Badge>
                <Badge>{formatNumber(model.readinessScore, 0)} / 100</Badge>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{model.currentUse}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                <div className="fine-print">Required Data</div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {model.requiredData.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                <div className="fine-print">Next Unlock</div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {model.unlockCriteria.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="fine-print">Validation</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {model.validationScore === null
                    ? 'not yet validated'
                    : `${formatNumber(model.validationScore, 0)} / 100`}
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{model.rankingNote}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
