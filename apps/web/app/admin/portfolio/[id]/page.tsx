import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { buildPortfolioDashboard, buildPortfolioOperatorBriefs, getPortfolioById } from '@/lib/services/portfolio';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PortfolioDetailPage({ params }: Props) {
  const { id } = await params;
  const portfolio = await getPortfolioById(id);
  if (!portfolio) notFound();

  const dashboard = buildPortfolioDashboard(portfolio);
  const briefs = buildPortfolioOperatorBriefs(portfolio, dashboard);

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Portfolio Command Center</div>
          <Badge>{portfolio.code}</Badge>
          {portfolio.strategy ? <Badge tone="neutral">{portfolio.strategy}</Badge> : null}
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          {portfolio.name}
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">{dashboard.operatorSummary}</p>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">{dashboard.researchSummary}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <div className="fine-print">Gross Hold Value</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.summary.grossHoldValueKrw)}</div>
        </Card>
        <Card>
          <div className="fine-print">Average Occupancy</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatPercent(dashboard.summary.averageOccupancyPct)}</div>
        </Card>
        <Card>
          <div className="fine-print">Annualized NOI</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.summary.annualizedNoiKrw)}</div>
        </Card>
        <Card>
          <div className="fine-print">Watchlist Assets</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(dashboard.summary.watchlistCount, 0)}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">AI Operator Brief</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="fine-print">Research Summary</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.researchBrief}</p>
            </div>
            <div>
              <div className="fine-print">Covenant / Watchlist Summary</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.covenantBrief}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Watchlist Draft</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="fine-print">Lease Rollover</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.watchlistBrief}</p>
            </div>
            <div>
              <div className="fine-print">Capex / Budget</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.capexBrief}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow">Asset Hold Performance</div>
        <div className="mt-4 grid gap-4">
          {dashboard.assetRows.map((row) => (
            <div key={row.portfolioAsset.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-white">{row.portfolioAsset.asset.name}</div>
                    <Badge>{row.portfolioAsset.status.toLowerCase()}</Badge>
                    <Badge tone="neutral">{row.portfolioAsset.asset.assetClass.replaceAll('_', ' ')}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {row.portfolioAsset.asset.assetCode} / {row.portfolioAsset.asset.address?.city ?? row.portfolioAsset.asset.market}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.latestDocumentHash ? <Badge>doc {row.latestDocumentHash.slice(0, 10)}</Badge> : null}
                    {row.latestAnchorReference ? <Badge tone="good">anchored</Badge> : <Badge tone="warn">offchain only</Badge>}
                    {row.covenant.breachCount > 0 ? <Badge tone="danger">covenant breach</Badge> : null}
                    {(row.leaseRoll?.next12MonthsExpiringPct ?? 0) >= 20 ? <Badge tone="warn">rollover watch</Badge> : null}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div>
                    <div className="fine-print">Hold Value</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(row.holdValueKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Occupancy</div>
                    <div className="mt-2 text-sm text-white">{formatPercent(row.latest?.occupancyPct)}</div>
                  </div>
                  <div>
                    <div className="fine-print">NOI</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(row.latest?.noiKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Passing Rent</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(row.latest?.passingRentKrwPerSqmMonth)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Market Rent</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(row.latest?.marketRentKrwPerSqmMonth)}</div>
                  </div>
                  <div>
                    <div className="fine-print">DSCR / LTV</div>
                    <div className="mt-2 text-sm text-white">
                      {formatNumber(row.latest?.debtServiceCoverage, 2)}x / {formatPercent(row.latest?.ltvPct)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">Lease Rollover Watchlist</div>
          <div className="mt-4 space-y-3">
            {dashboard.leaseRolloverWatchlist.map((row) => (
              <div key={row.portfolioAsset.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.portfolioAsset.asset.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.leaseRoll?.watchlistSummary ?? 'Lease expiry risk review'}</div>
                  </div>
                  <div className="text-right text-sm text-white">
                    <div>12m {formatPercent(row.leaseRoll?.next12MonthsExpiringPct)}</div>
                    <div>24m {formatPercent(row.leaseRoll?.next24MonthsExpiringPct)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Debt Maturity Wall</div>
          <div className="mt-4 space-y-3">
            {dashboard.debtMaturityWall.map((row) => (
              <div key={row.facility.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.asset.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.facility.lenderName ?? 'Lender pending'} / {row.facility.facilityType.toLowerCase()}</div>
                  </div>
                  <div className="text-right text-sm text-white">
                    <div>{formatCurrency(row.facility.commitmentKrw)}</div>
                    <div>{row.maturityDate ? formatDate(row.maturityDate) : 'term pending'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">LTV / DSCR / Covenant Status</div>
          <div className="mt-4 space-y-3">
            {dashboard.covenantWatchlist.map((row) => (
              <div key={row.portfolioAsset.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.portfolioAsset.asset.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {row.covenant.breachCount} breach / {row.covenant.watchCount} watch / {row.covenant.passingCount} pass
                    </div>
                  </div>
                  <div className="text-right text-sm text-white">
                    <div>DSCR {formatNumber(row.latest?.debtServiceCoverage, 2)}x</div>
                    <div>LTV {formatPercent(row.latest?.ltvPct)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Capex vs Budget</div>
          <div className="mt-4 space-y-3">
            {dashboard.capexBudgetTracker.map((row) => (
              <div key={row.portfolioAsset.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.portfolioAsset.asset.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Budget variance {formatCurrency(row.varianceBudget)}
                    </div>
                  </div>
                  <div className="text-right text-sm text-white">
                    <div>{formatCurrency(row.capexSpent)} spent</div>
                    <div>{formatCurrency(row.capexBudget)} budget</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow">Exit Case Tracker</div>
        <div className="mt-4 space-y-3">
          {dashboard.exitCaseTracker.map((row) => (
            <div key={row.exitCase.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{row.asset.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {row.exitCase.caseLabel} / {row.exitCase.statusLabel}
                  </div>
                </div>
                <div className="text-right text-sm text-white">
                  <div>{formatCurrency(row.exitCase.underwritingValueKrw ?? row.holdValueKrw)}</div>
                  <div>
                    {row.exitCase.targetExitDate ? formatDate(row.exitCase.targetExitDate) : 'date pending'} / cap{' '}
                    {formatPercent(row.exitCase.targetCapRatePct)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
