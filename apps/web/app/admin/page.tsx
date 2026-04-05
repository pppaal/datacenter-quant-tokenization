import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DealPipelinePanel } from '@/components/admin/deal-pipeline-panel';
import { DealCloseProbabilityPanel } from '@/components/admin/deal-close-probability-panel';
import { DealReminderPanel } from '@/components/admin/deal-reminder-panel';
import { ForecastModelStackPanel } from '@/components/admin/forecast-model-stack-panel';
import { ForecastEnsemblePanel } from '@/components/admin/forecast-ensemble-panel';
import { ForecastRealizedBacktestPanel } from '@/components/admin/forecast-realized-backtest-panel';
import { MacroBacktestPanel } from '@/components/admin/macro-backtest-panel';
import { MacroForecastBacktestPanel } from '@/components/admin/macro-forecast-backtest-panel';
import { MacroMonitorPanel } from '@/components/admin/macro-monitor-panel';
import { RealizedOutcomeSummaryPanel } from '@/components/admin/realized-outcome-summary-panel';
import { ValuationRunBadges } from '@/components/valuation/valuation-run-badges';
import { getAdminData } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const {
    summary,
    assets,
    valuations,
    documents,
    inquiries,
    readiness,
    sourceHealth,
    dealPipeline,
    dealCloseProbability,
    dealReminders,
    portfolioRisk,
    counterpartyRisk,
    quantSignals,
    quantAllocation,
    quantAssetClassAllocation,
    macroMonitor,
    forecastModelStack,
    macroBacktest,
    macroForecastBacktest,
    forecastRealizedBacktest,
    forecastEnsemblePolicy,
    realizedOutcomeSummary
  } =
    await getAdminData();
  const fxRateMap = await getFxRateMap([
    ...assets.map((asset) => resolveDisplayCurrency(asset.address?.country ?? asset.market)),
    ...valuations.map((run) => resolveDisplayCurrency(run.asset.address?.country ?? run.asset.market))
  ]);
  const readyCount = readiness.filter((item) => item.readinessStatus === 'READY').length;
  const hasSourceAlert =
    sourceHealth.sourceFreshness.stale > 0 ||
    sourceHealth.sourceFreshness.failed > 0 ||
    sourceHealth.assetFreshness.staleCandidates > 0;
  const hasPortfolioRiskAlert = portfolioRisk.highRiskCount > 0;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">Ops Overview</Badge>
            <Badge>{formatNumber(inquiries.length, 0)} inquiries</Badge>
          </div>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white">
            Operator surface for a Korean AI-native real-estate investment firm.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            The console connects research, review-gated underwriting, deal execution, portfolio operations, and capital
            reporting in one offchain operating environment.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/assets/new">
              <Button>Create New Asset</Button>
            </Link>
            <Link href="/admin/documents">
              <Button variant="secondary">Open Data Room</Button>
            </Link>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Tracked assets', formatNumber(summary.assetCount, 0), 'Live underwriting cases'],
            ['Under review', formatNumber(summary.underReviewCount, 0), 'Currently enriched or modeled'],
            ['Documents', formatNumber(summary.documentCount, 0), 'Tracked files and versions'],
            ['Review ready', formatNumber(readyCount, 0), 'Projects fit for committee packaging']
          ].map(([label, value, subline]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-4xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{subline}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="xl:col-span-2">
          <DealReminderPanel summary={dealReminders} />
        </div>

        <div className="xl:col-span-2">
          <DealCloseProbabilityPanel summary={dealCloseProbability} />
        </div>

        <div className="xl:col-span-2">
          <DealPipelinePanel summary={dealPipeline} />
        </div>

        <div className="xl:col-span-2">
          <MacroMonitorPanel monitor={macroMonitor} />
        </div>

        <div className="xl:col-span-2">
          <ForecastModelStackPanel stack={forecastModelStack} />
        </div>

        <div className="xl:col-span-2">
          <ForecastEnsemblePanel policy={forecastEnsemblePolicy} />
        </div>

        <div className="xl:col-span-2">
          <MacroBacktestPanel backtest={macroBacktest} />
        </div>

        <div className="xl:col-span-2">
          <MacroForecastBacktestPanel backtest={macroForecastBacktest} />
        </div>

        <div className="xl:col-span-2">
          <ForecastRealizedBacktestPanel backtest={forecastRealizedBacktest} />
        </div>

        <div className="xl:col-span-2">
          <RealizedOutcomeSummaryPanel summary={realizedOutcomeSummary} />
        </div>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Market Quant</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Cross-asset macro signals</h2>
            </div>
            <Badge tone={quantSignals.length > 0 ? 'good' : 'neutral'}>
              {quantSignals.length > 0 ? `${quantSignals.length} markets` : 'No factors yet'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4">
            {quantSignals.length > 0 ? (
              quantSignals.map((market) => (
                <div key={market.market} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{market.market}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {market.asOf ? `as of ${formatDate(market.asOf)}` : 'latest'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {market.signals.map((signal) => (
                      <div key={signal.key} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="fine-print">{signal.label}</div>
                          <Badge
                            tone={
                              signal.stance === 'RISK_OFF' ||
                              signal.stance === 'SHORT_DURATION' ||
                              signal.stance === 'UNDERWEIGHT'
                                ? 'warn'
                                : signal.stance === 'RISK_ON' ||
                                    signal.stance === 'LONG_DURATION' ||
                                    signal.stance === 'OVERWEIGHT'
                                  ? 'good'
                                  : 'neutral'
                            }
                          >
                            {signal.stance.toLowerCase().replaceAll('_', ' ')}
                          </Badge>
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(signal.score, 2)}</div>
                        <p className="mt-2 text-sm leading-7 text-slate-300">{signal.commentary}</p>
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {signal.drivers.map((driver) => (
                            <div key={driver}>{driver}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No persisted macro factors yet. Run source enrichment to populate the common macro core.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Allocation View</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Macro-driven market stance</h2>
            </div>
            <Badge tone={quantAllocation.some((item) => item.stance !== 'NEUTRAL') ? 'good' : 'neutral'}>
              {quantAllocation.some((item) => item.stance !== 'NEUTRAL') ? 'Active views' : 'Benchmark'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4">
            {quantAllocation.length > 0 ? (
              quantAllocation.map((item) => (
                <div key={item.market} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{item.market}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {item.asOf ? `as of ${formatDate(item.asOf)}` : 'latest'}
                      </div>
                    </div>
                    <Badge
                      tone={
                        item.stance === 'OVERWEIGHT'
                          ? 'good'
                          : item.stance === 'UNDERWEIGHT'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {item.stance.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr]">
                    <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                      <div className="fine-print">Allocation Score</div>
                      <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(item.score, 2)}</div>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                      <p className="text-sm leading-7 text-slate-300">{item.commentary}</p>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        {item.strongestSignals.map((signal) => (
                          <div key={signal}>{signal}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No market allocation view yet. Persist macro factors first.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Asset Class Allocation</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Market by sector stance</h2>
            </div>
            <Badge tone={quantAssetClassAllocation.some((item) => item.stance !== 'NEUTRAL') ? 'good' : 'neutral'}>
              {quantAssetClassAllocation.some((item) => item.stance !== 'NEUTRAL') ? 'Sector views active' : 'Benchmark'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4">
            {quantAssetClassAllocation.length > 0 ? (
              quantAssetClassAllocation.slice(0, 8).map((item) => (
                <div key={`${item.market}-${item.assetClass}`} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {item.market} / {item.assetClass.replaceAll('_', ' ')}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {item.asOf ? `as of ${formatDate(item.asOf)}` : 'latest'}
                      </div>
                    </div>
                    <Badge
                      tone={
                        item.stance === 'OVERWEIGHT'
                          ? 'good'
                          : item.stance === 'UNDERWEIGHT'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {item.stance.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr]">
                    <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                      <div className="fine-print">Sector Score</div>
                      <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(item.score, 2)}</div>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                      <p className="text-sm leading-7 text-slate-300">{item.commentary}</p>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        {item.strongestSignals.map((signal) => (
                          <div key={signal}>{signal}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No asset-class allocation view yet. Persist macro factors first.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Portfolio Risk</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Refinance and covenant watchlist</h2>
            </div>
            <Badge tone={hasPortfolioRiskAlert ? 'warn' : 'good'}>
              {hasPortfolioRiskAlert ? 'Risk flagged' : 'In range'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Refinance watch</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(portfolioRisk.refinanceWatchCount, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Assets with moderate or high refinance pressure in the latest run.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Covenant watch</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(portfolioRisk.covenantWatchCount, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">Liquidity or covenant headroom looks tight in downside.</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">High-risk deals</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(portfolioRisk.highRiskCount, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Latest underwriting case screens high risk on refinance or covenant pressure.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {portfolioRisk.watchlist.length > 0 ? (
              portfolioRisk.watchlist.map((item) => (
                <Link
                  key={item.runId}
                  href={`/admin/valuations/${item.runId}`}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{item.assetName}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {item.assetCode} / {item.assetClass}
                    </div>
                  </div>
                  <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-2 md:text-left">
                    <div>
                      <div className="fine-print">Refi</div>
                      <div className="mt-1">{item.refinanceRiskLevel}</div>
                    </div>
                    <div>
                      <div className="fine-print">Covenant</div>
                      <div className="mt-1">{item.covenantPressureLevel}</div>
                    </div>
                    <div>
                      <div className="fine-print">DSCR Haircut</div>
                      <div className="mt-1">{formatNumber(item.downsideDscrHaircutPct, 1)}%</div>
                    </div>
                    <div>
                      <div className="fine-print">Current Ratio</div>
                      <div className="mt-1">
                        {item.weakestCurrentRatio !== null ? `${formatNumber(item.weakestCurrentRatio, 2)}x` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No refinance or covenant alerts in the latest portfolio runs.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Source Freshness</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">NASA and adapter refresh queue</h2>
            </div>
            <div className="flex gap-2">
              <Badge tone={hasSourceAlert ? 'warn' : 'good'}>
                {hasSourceAlert ? 'Attention needed' : 'Current'}
              </Badge>
              <Link href="/admin/sources">
                <Button variant="ghost">Open Sources</Button>
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Fresh adapters</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(sourceHealth.sourceFreshness.fresh, 0)} / {formatNumber(sourceHealth.sourceFreshness.total, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Latest source fetch: {formatDate(sourceHealth.sourceFreshness.latestFetchAt)}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Stale assets</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(sourceHealth.assetFreshness.staleCandidates, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Re-enrichment target older than {formatNumber(sourceHealth.staleThresholdHours, 0)} hours.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Stale systems</div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNumber(
                  sourceHealth.sourceFreshness.stale + sourceHealth.sourceFreshness.failed,
                  0
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {sourceHealth.sourceFreshness.staleSystems.slice(0, 3).join(', ') || 'No stale adapters detected.'}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {sourceHealth.assetFreshness.staleAssets.length > 0 ? (
              sourceHealth.assetFreshness.staleAssets.map((asset) => (
                <Link
                  key={asset.assetId}
                  href={`/admin/assets/${asset.assetId}`}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{asset.assetName}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {asset.assetCode} {asset.city ? `/ ${asset.city}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-400">
                    <div>Last enrich {formatDate(asset.lastEnrichedAt)}</div>
                    <div className="mt-1 text-xs text-slate-500">Queued for scheduled refresh</div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                All tracked assets are inside the configured refresh window.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Portfolio Queue</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Active underwriting assets</h2>
            </div>
            <Link href="/admin/assets">
              <Button variant="ghost">See all</Button>
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {assets.slice(0, 4).map((asset) => (
              (() => {
                const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
                const fxRateToKrw = fxRateMap[displayCurrency];

                return (
                  <Link
                    key={asset.id}
                    href={`/admin/assets/${asset.id}`}
                    className="block rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{asset.name}</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {asset.address?.city} / {asset.assetClass}
                        </div>
                      </div>
                      <Badge>{asset.status}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="fine-print">Asset Code</div>
                        <div className="mt-2 text-sm text-slate-300">{asset.assetCode}</div>
                      </div>
                      <div>
                        <div className="fine-print">
                          {asset.assetClass === AssetClass.DATA_CENTER ? 'Power' : 'Area'}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {asset.assetClass === AssetClass.DATA_CENTER
                            ? `${formatNumber(asset.powerCapacityMw)} MW`
                            : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                        </div>
                      </div>
                      <div>
                        <div className="fine-print">Latest Value</div>
                        <div className="mt-2 text-sm text-slate-300">
                          {formatCurrencyFromKrwAtRate(
                            asset.valuations[0]?.baseCaseValueKrw ?? asset.currentValuationKrw,
                            displayCurrency,
                            fxRateToKrw
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })()
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Recent Output</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Latest valuation runs</h2>
            </div>
            <Link href="/admin/valuations">
              <Button variant="ghost">History</Button>
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {valuations.slice(0, 3).map((run) => (
              (() => {
                const displayCurrency = resolveDisplayCurrency(run.asset.address?.country ?? run.asset.market);
                const fxRateToKrw = fxRateMap[displayCurrency];

                return (
                  <Link
                    key={run.id}
                    href={`/admin/valuations/${run.id}`}
                    className="block rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{run.asset.name}</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {run.runLabel} / {formatDate(run.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="fine-print">Base Case</div>
                        <div className="mt-2 text-base font-semibold text-white">
                          {formatCurrencyFromKrwAtRate(run.baseCaseValueKrw, displayCurrency, fxRateToKrw)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <ValuationRunBadges
                        createdAt={run.createdAt}
                        confidenceScore={run.confidenceScore}
                        provenance={Array.isArray(run.provenance) ? (run.provenance as any[]) : []}
                        scenarios={run.scenarios}
                      />
                    </div>
                  </Link>
                );
              })()
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Counterparty Risk</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Role-based credit watch</h2>
            </div>
            <Badge tone={counterpartyRisk.highRiskCount > 0 ? 'warn' : 'good'}>
              {counterpartyRisk.highRiskCount > 0 ? 'Counterparties flagged' : 'Stable'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {counterpartyRisk.roleSummary.map((item) => (
              <div key={item.role} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="fine-print">{item.role}</div>
                <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(item.assessmentCount, 0)}</div>
                <p className="mt-2 text-sm text-slate-400">
                  High risk {formatNumber(item.highRiskCount, 0)} / Moderate {formatNumber(item.moderateRiskCount, 0)}
                </p>
                <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Avg score {item.averageScore !== null ? formatNumber(item.averageScore, 1) : 'N/A'}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3">
            {counterpartyRisk.watchlist.length > 0 ? (
              counterpartyRisk.watchlist.map((item) => (
                <Link
                  key={item.assessmentId}
                  href={`/admin/assets/${item.assetId}`}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{item.counterpartyName}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {item.counterpartyRole} / {item.assetCode}
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-300">
                    <div>{item.riskLevel}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Score {formatNumber(item.score, 0)} / {item.assetName}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No sponsor, tenant, or operator credit alerts in the latest assessments.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Operational Feed</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Documents and review readiness</h2>
          <div className="mt-5 grid gap-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Documents</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(documents.totalCount, 0)}</div>
              <p className="mt-2 text-sm text-slate-400">
                Latest upload:{' '}
                {documents.latest ? `${documents.latest.title} on ${formatDate(documents.latest.updatedAt)}` : 'No documents yet'}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="fine-print">Readiness Queue</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(readiness.length, 0)}</div>
              <p className="mt-2 text-sm text-slate-400">
                Ready now: {formatNumber(readyCount, 0)} projects with sufficient records for the next review step.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Action Center</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Move the operating queue forward</h2>
          <div className="mt-5 grid gap-3">
            {[
              {
                href: '/admin/review',
                title: 'Clear pending evidence',
                detail: 'Approve or reject normalized micro, legal, and lease evidence before it flows into reports and valuation.'
              },
              {
                href: '/admin/research',
                title: 'Refresh research coverage',
                detail: 'Run official-source sync and work the coverage queue before sourcing, underwriting, or investor reporting relies on stale research.'
              },
              {
                href: '/admin/deals?view=actionable',
                title: 'Advance live deals',
                detail: 'Work next actions, diligence requests, lender quotes, and bid revisions from the actionable execution queue.'
              },
              {
                href: '/admin/portfolio',
                title: 'Monitor held assets',
                detail: 'Review covenant, rollover, capex, and optimization signals across current portfolio holdings.'
              }
            ].map((item, index) => (
              <Link
                key={item.title}
                href={item.href}
                className="flex gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="font-mono text-sm text-accent">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="mt-1 text-sm leading-7 text-slate-300">{item.detail}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
