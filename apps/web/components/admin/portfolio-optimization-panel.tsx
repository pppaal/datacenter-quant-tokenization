import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { PortfolioOptimizationLab } from '@/lib/services/portfolio-optimization';
import { formatNumber, formatPercent } from '@/lib/utils';

type Props = {
  lab: PortfolioOptimizationLab;
};

function toneForResearch(status: string) {
  if (status === 'FRESH') return 'good' as const;
  if (status === 'STALE' || status === 'MANUAL') return 'warn' as const;
  return 'danger' as const;
}

function toneForRecommendation(recommendation: string) {
  if (recommendation === 'ADD') return 'good' as const;
  if (recommendation === 'TRIM') return 'warn' as const;
  return 'neutral' as const;
}

export function PortfolioOptimizationPanel({ lab }: Props) {
  const fragileScenario = [...lab.scenarioRows].sort(
    (left, right) => right.weightedStressScore - left.weightedStressScore
  )[0];

  return (
    <Card>
      <div className="eyebrow">Portfolio Optimization Lab</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="warn">{lab.methodologyLabel}</Badge>
        <Badge
          tone={
            lab.objectiveScorePct >= 68 ? 'good' : lab.objectiveScorePct >= 52 ? 'warn' : 'danger'
          }
        >
          objective {formatPercent(lab.objectiveScorePct)}
        </Badge>
        {fragileScenario ? (
          <Badge tone={fragileScenario.weightedStressScore >= 18 ? 'danger' : 'warn'}>
            worst search {formatNumber(fragileScenario.weightedStressScore, 1)}
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-300">{lab.summary}</p>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Primary Move</div>
          <p className="mt-2 text-sm leading-7 text-white">{lab.topMove}</p>
        </div>
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Defensive Move</div>
          <p className="mt-2 text-sm leading-7 text-white">{lab.defensiveMove}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div className="fine-print">Target Weights</div>
          {lab.assetRows.map((row) => (
            <div
              key={row.portfolioAssetId}
              className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">{row.assetName}</div>
                    <Badge>{row.assetCode}</Badge>
                    <Badge tone="neutral">{row.assetClass.replaceAll('_', ' ')}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{row.marketLabel}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={toneForRecommendation(row.recommendation)}>
                    {row.recommendation.toLowerCase()}
                  </Badge>
                  <Badge tone={toneForResearch(row.researchFreshnessStatus)}>
                    {row.researchFreshnessStatus.toLowerCase()}
                  </Badge>
                  {row.pendingBlockerCount > 0 ? (
                    <Badge tone="warn">{row.pendingBlockerCount} blockers</Badge>
                  ) : null}
                  {row.openCoverageTaskCount > 0 ? (
                    <Badge tone="warn">{row.openCoverageTaskCount} tasks</Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div>
                  <div className="fine-print">Current</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(row.currentWeightPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Target</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(row.targetWeightPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Delta</div>
                  <div className="mt-1 text-sm text-white">
                    {row.deltaPct >= 0 ? '+' : ''}
                    {formatPercent(row.deltaPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Signal</div>
                  <div className="mt-1 text-sm text-white">{formatPercent(row.scorePct)}</div>
                </div>
                <div>
                  <div className="fine-print">Stress Load</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(row.stressPenaltyPct)}
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs leading-6 text-slate-400">
                {row.reasons.map((reason) => (
                  <li key={`${row.portfolioAssetId}-${reason}`}>{reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="fine-print">Scenario Exploration</div>
          {lab.scenarioRows.map((scenario) => (
            <div
              key={scenario.label}
              className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">{scenario.label}</div>
                <Badge
                  tone={
                    scenario.weightedStressScore >= 18
                      ? 'danger'
                      : scenario.weightedStressScore >= 12
                        ? 'warn'
                        : 'good'
                  }
                >
                  stress {formatNumber(scenario.weightedStressScore, 1)}
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="fine-print">Cap Rate Shock</div>
                  <div className="mt-1 text-sm text-white">
                    {formatNumber(scenario.capRateShockBps, 0)} bps
                  </div>
                </div>
                <div>
                  <div className="fine-print">Occupancy Shock</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(scenario.occupancyShockPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Debt Spread</div>
                  <div className="mt-1 text-sm text-white">
                    {formatNumber(scenario.debtSpreadShockBps, 0)} bps
                  </div>
                </div>
                <div>
                  <div className="fine-print">Lead Asset</div>
                  <div className="mt-1 text-sm text-white">
                    {scenario.leadAssetName ?? 'Portfolio-wide'}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Value Impact</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(scenario.weightedValueImpactPct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">DSCR Impact</div>
                  <div className="mt-1 text-sm text-white">
                    {formatPercent(scenario.weightedDscrImpactPct)}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-400">{scenario.commentary}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
