import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { formatNumber } from '@/lib/utils';

function toneForConfidence(value: string) {
  if (value === 'HIGH') return 'good' as const;
  if (value === 'MEDIUM') return 'neutral' as const;
  return 'warn' as const;
}

export function ForecastEnsemblePanel({ policy }: { policy: ForecastEnsemblePolicy }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Ensemble Policy</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Which model should drive which decision
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[hsl(var(--muted))]">
            This policy turns validation and readiness into usable model weights. It answers which
            engine should lead market interpretation, downside framing, and near-term asset drift
            calls.
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
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Primary Model</div>
          <div className="mt-3 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {policy.summary.primaryModelKey}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Highest blended weight across the current macro decision stack.
          </p>
        </div>
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Validated Models</div>
          <div className="mt-3 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(policy.summary.validatedModelCount, 0)}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Models with actual backtest evidence behind their current weight.
          </p>
        </div>
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Portfolio Confidence</div>
          <div className="mt-3 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {policy.summary.portfolioForecastConfidence}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Average quality of the current champion model across use cases.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {policy.useCases.map((useCase) => (
          <div
            key={useCase.key}
            className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  {useCase.label}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                  champion {useCase.championModelKey}
                </div>
              </div>
              {useCase.challengerModelKey ? <Badge>{useCase.challengerModelKey}</Badge> : null}
            </div>
            <p className="mt-4 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
              {useCase.summary}
            </p>

            <div className="mt-4 space-y-3">
              {useCase.weights.map((weight) => (
                <div
                  key={weight.modelKey}
                  className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {weight.label}
                    </div>
                    <div className="flex gap-2">
                      <Badge>{formatNumber(weight.weightPct, 0)}%</Badge>
                      <Badge tone="neutral">q {formatNumber(weight.qualityScore, 0)}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted))]">
                    {weight.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
