import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { formatNumber } from '@/lib/utils';

function toneForConfidence(value: string) {
  if (value === 'HIGH') return 'good' as const;
  if (value === 'MEDIUM') return 'neutral' as const;
  return 'warn' as const;
}

export function ForecastEnsemblePanel({
  policy
}: {
  policy: ForecastEnsemblePolicy;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Ensemble Policy</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Which model should drive which decision</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            This policy turns validation and readiness into usable model weights. It answers which engine should lead
            market interpretation, downside framing, and near-term asset drift calls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={toneForConfidence(policy.summary.portfolioForecastConfidence)}>
            {policy.summary.portfolioForecastConfidence.toLowerCase()} confidence
          </Badge>
          <Badge>{policy.summary.primaryModelKey}</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Primary Model</div>
          <div className="mt-3 text-2xl font-semibold text-white">{policy.summary.primaryModelKey}</div>
          <p className="mt-2 text-sm text-slate-400">Highest blended weight across the current macro decision stack.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Validated Models</div>
          <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(policy.summary.validatedModelCount, 0)}</div>
          <p className="mt-2 text-sm text-slate-400">Models with actual backtest evidence behind their current weight.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Portfolio Confidence</div>
          <div className="mt-3 text-2xl font-semibold text-white">{policy.summary.portfolioForecastConfidence}</div>
          <p className="mt-2 text-sm text-slate-400">Average quality of the current champion model across use cases.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {policy.useCases.map((useCase) => (
          <div key={useCase.key} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">{useCase.label}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                  champion {useCase.championModelKey}
                </div>
              </div>
              {useCase.challengerModelKey ? <Badge>{useCase.challengerModelKey}</Badge> : null}
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{useCase.summary}</p>

            <div className="mt-4 space-y-3">
              {useCase.weights.map((weight) => (
                <div key={weight.modelKey} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{weight.label}</div>
                    <div className="flex gap-2">
                      <Badge>{formatNumber(weight.weightPct, 0)}%</Badge>
                      <Badge tone="neutral">q {formatNumber(weight.qualityScore, 0)}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{weight.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
