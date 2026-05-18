import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ForecastDecisionGuide } from '@/lib/services/forecast/decision';
import { formatNumber } from '@/lib/utils';

function toneForConfidence(value: string) {
  if (value === 'HIGH') return 'good' as const;
  if (value === 'MEDIUM') return 'neutral' as const;
  return 'warn' as const;
}

export function ForecastDecisionPanel({ guide }: { guide: ForecastDecisionGuide | null }) {
  if (!guide) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Forecast Decision Guide</div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Which engine should lead this deal right now
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">{guide.summary.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={toneForConfidence(guide.summary.overallConfidence)}>
            {guide.summary.overallConfidence.toLowerCase()} confidence
          </Badge>
          <Badge>{guide.summary.primaryModelKey}</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {guide.useCases.map((useCase) => (
          <div
            key={useCase.key}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">{useCase.label}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                  lead {useCase.recommendedModelKey}
                </div>
              </div>
              <Badge tone={toneForConfidence(useCase.confidenceBand)}>
                {useCase.confidenceBand.toLowerCase()}
              </Badge>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-300">{useCase.summary}</p>

            <div className="mt-4 space-y-3">
              {useCase.weights.map((weight) => (
                <div
                  key={weight.modelKey}
                  className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{weight.label}</div>
                    <div className="flex gap-2">
                      <Badge>{formatNumber(weight.weightPct, 0)}%</Badge>
                      <Badge tone="neutral">c {formatNumber(weight.confidenceScore, 0)}</Badge>
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
