import Link from 'next/link';
import { headers } from 'next/headers';
import { AdminAccessScopeType } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { filterRowsByGrantedScopeIds, listGrantedScopeIdsForUser } from '@/lib/security/admin-access';
import { prisma } from '@/lib/db/prisma';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import {
  buildPortfolioDashboard,
  listPortfolios,
  type PortfolioDashboard,
  type PortfolioRecord
} from '@/lib/services/portfolio';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const actor = await resolveVerifiedAdminActorFromHeaders(await headers(), prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const portfolios = await listPortfolios();
  const grantedPortfolioIds = await listGrantedScopeIdsForUser(actor?.userId, AdminAccessScopeType.PORTFOLIO, prisma);
  const scopedPortfolios = filterRowsByGrantedScopeIds(portfolios, grantedPortfolioIds);
  const dashboards: Array<{ portfolio: PortfolioRecord; dashboard: PortfolioDashboard }> = scopedPortfolios.map((portfolio) => ({
    portfolio,
    dashboard: buildPortfolioDashboard(portfolio)
  }));

  const totalHoldValue = dashboards.reduce(
    (total, entry) => total + (entry.dashboard.summary.grossHoldValueKrw ?? 0),
    0
  );
  const totalAssets = dashboards.reduce((total, entry) => total + entry.dashboard.summary.assetCount, 0);
  const totalWatchlist = dashboards.reduce((total, entry) => total + entry.dashboard.summary.watchlistCount, 0);

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="eyebrow">Portfolio OS</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Hold performance, covenant watchlists, and exit cases in one operating layer.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          Portfolio OS extends the current research, underwriting, and deal execution stack into held-asset operations
          for a Korean real-estate investment firm.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div className="fine-print">Hold Value</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatCurrency(totalHoldValue)}</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">Held Assets</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(totalAssets, 0)}</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">Watchlist</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(totalWatchlist, 0)}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5">
        {dashboards.map(({ portfolio, dashboard }) => (
          <Link key={portfolio.id} href={`/admin/portfolio/${portfolio.id}`} className="block">
            <Card className="transition hover:border-white/20 hover:bg-white/[0.05]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-2xl font-semibold text-white">{portfolio.name}</div>
                    <Badge>{portfolio.code}</Badge>
                    {portfolio.strategy ? <Badge tone="neutral">{portfolio.strategy}</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    {dashboard.operatorSummary}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-500">{dashboard.researchSummary}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="fine-print">Asset Count</div>
                    <div className="mt-2 text-sm text-white">{formatNumber(dashboard.summary.assetCount, 0)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Average Occupancy</div>
                    <div className="mt-2 text-sm text-white">{formatPercent(dashboard.summary.averageOccupancyPct)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Annualized NOI</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(dashboard.summary.annualizedNoiKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Watchlist</div>
                    <div className="mt-2 text-sm text-white">{formatNumber(dashboard.summary.watchlistCount, 0)}</div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        {dashboards.length === 0 ? (
          <Card>
            <div className="eyebrow">No Portfolio Yet</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Seed or load a held portfolio</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Portfolio OS becomes useful when held assets carry monthly KPI history, budget lines, covenant tests, and
              exit cases.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
