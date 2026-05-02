import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { AssetEnrichmentButton } from '@/components/admin/asset-enrichment-button';
import { QuickValuationRunButton } from '@/components/admin/quick-valuation-run-button';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { SatelliteRiskSummary } from '@/components/valuation/satellite-risk-summary';
import { ValuationRunBadges } from '@/components/valuation/valuation-run-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getFxRateMap } from '@/lib/services/fx';
import { listValuationRuns } from '@/lib/services/valuations';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { getValuationFeatureSourceDescriptors } from '@/lib/valuation/feature-snapshot-usage';
import { resolveSatelliteRiskSnapshot } from '@/lib/valuation/satellite-risk';

export const dynamic = 'force-dynamic';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

function getApprovalTone(approvalStatus: string) {
  if (approvalStatus === 'APPROVED') return 'good' as const;
  if (approvalStatus === 'CONDITIONAL') return 'warn' as const;
  if (approvalStatus === 'REJECTED') return 'danger' as const;
  return 'neutral' as const;
}

export default async function ValuationsPage() {
  const runs = await listValuationRuns();
  const fxRateMap = await getFxRateMap(
    runs.map((run) => resolveDisplayCurrency(run.asset.address?.country ?? run.asset.market))
  );
  const avgConfidence =
    runs.reduce((sum, run) => sum + (run.confidenceScore ?? 0), 0) / Math.max(runs.length, 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="hero-mesh">
          <div className="eyebrow">Investment Memo Feed</div>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
            Generated IMs, scenario output, and committee posture in one stream.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            Review what changed in each run across multiple asset sectors, which deals are ready for
            committee, and where the scenario spread or diligence posture still needs work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/assets">
              <Button>Open Asset Pipeline</Button>
            </Link>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['IM Runs', formatNumber(runs.length, 0), 'generated analyses'],
            ['Avg Confidence', formatNumber(avgConfidence, 1), 'across current run history'],
            [
              'Committee Ready',
              formatNumber(runs.filter((run) => (run.confidenceScore ?? 0) >= 75).length, 0),
              'strongest current candidates'
            ]
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5">
        {runs.map((run) => {
          const provenance = Array.isArray(run.provenance)
            ? (run.provenance as ProvenanceEntry[])
            : [];
          const displayCurrency = resolveDisplayCurrency(
            run.asset.address?.country ?? run.asset.market
          );
          const fxRateToKrw = fxRateMap[displayCurrency];
          const satelliteRisk = resolveSatelliteRiskSnapshot({
            assumptions: run.assumptions,
            siteProfile: run.asset.siteProfile
          });
          const recommendation = getRecommendation(run.confidenceScore);
          const featureSources = getValuationFeatureSourceDescriptors(run.assumptions);

          return (
            <Card key={run.id}>
              <div className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="fine-print">{run.runLabel}</div>
                      <Link
                        href={`/admin/valuations/${run.id}`}
                        className="mt-2 block text-2xl font-semibold text-white underline-offset-4 hover:underline"
                      >
                        {run.asset.name}
                      </Link>
                      <div className="mt-2 text-sm text-slate-400">
                        {formatDate(run.createdAt)} / {run.engineVersion} / {run.asset.assetClass}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="good">{run.status}</Badge>
                      <Badge tone={getApprovalTone(run.approvalStatus)}>
                        {run.approvalStatus.replaceAll('_', ' ')}
                      </Badge>
                      <Badge>{recommendation}</Badge>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ValuationRunBadges
                      createdAt={run.createdAt}
                      confidenceScore={run.confidenceScore}
                      provenance={provenance}
                      scenarios={run.scenarios}
                    />
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Base Case</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatCurrencyFromKrwAtRate(
                          run.baseCaseValueKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Confidence</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatNumber(run.confidenceScore, 1)}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Bull</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatCurrencyFromKrwAtRate(
                          run.scenarios[0]?.valuationKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Bear</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatCurrencyFromKrwAtRate(
                          run.scenarios[2]?.valuationKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <SatelliteRiskSummary snapshot={satelliteRisk} compact />
                  </div>

                  {featureSources.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {featureSources.map((feature) => (
                        <Badge key={`${run.id}-${feature.namespace}`}>{feature.label}</Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {run.scenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300"
                      >
                        {scenario.name}: {formatPercent(scenario.exitCapRatePct)} exit cap /{' '}
                        {formatNumber(scenario.debtServiceCoverage, 2)}x DSCR
                      </div>
                    ))}
                    <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
                      {run.asset.assetClass === AssetClass.DATA_CENTER
                        ? `${formatNumber(run.asset.powerCapacityMw)} MW`
                        : `${formatNumber(run.asset.rentableAreaSqm ?? run.asset.grossFloorAreaSqm)} sqm`}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="eyebrow">Generated IM</div>
                    <p className="mt-4 text-sm leading-7 text-slate-300">{run.underwritingMemo}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link href={`/admin/valuations/${run.id}`}>
                      <Button>Open IM Detail</Button>
                    </Link>
                    <Link href={`/admin/assets/${run.assetId}`}>
                      <Button variant="secondary">Open Asset</Button>
                    </Link>
                    <QuickValuationRunButton
                      assetId={run.assetId}
                      assetCode={run.asset.assetCode}
                      variant="secondary"
                    />
                    <AssetEnrichmentButton assetId={run.assetId} />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
