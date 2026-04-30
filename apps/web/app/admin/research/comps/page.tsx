import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/db/prisma';
import { aggregateCapRates } from '@/lib/services/research/cap-rate-aggregator';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SearchParams = {
  market?: string;
  region?: string;
  assetClass?: string;
};

function parseAssetClass(value: string | undefined): AssetClass | undefined {
  if (!value) return undefined;
  return (Object.values(AssetClass) as string[]).includes(value)
    ? (value as AssetClass)
    : undefined;
}

function formatCapPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatPriceKrw(value: number | null) {
  if (value === null) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}조`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
  return formatNumber(value, 0);
}

export default async function ResearchCompsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await props.searchParams;
  const filters = {
    market: sp.market || undefined,
    region: sp.region || undefined,
    assetClass: parseAssetClass(sp.assetClass)
  };

  const [aggregation, recentTransactions] = await Promise.all([
    aggregateCapRates(filters),
    prisma.transactionComp.findMany({
      where: {
        capRatePct: { not: null },
        market: filters.market,
        region: filters.region,
        assetClass: filters.assetClass
      },
      orderBy: { transactionDate: 'desc' },
      take: 24,
      include: {
        asset: { select: { assetCode: true, name: true } }
      }
    })
  ]);

  const hasFilter = !!(filters.market || filters.region || filters.assetClass);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Research</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Cap-rate matrix · transaction comps
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Submarket × asset-class × tier cap-rate aggregation built from
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">TransactionComp</code> (deal-level
            ground truth) and
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">MarketIndicatorSeries</code>
            (REB / MOLIT published series). Divergence between the two columns is itself a useful
            repricing signal.
          </p>
        </div>
        <Link href="/admin/research">
          <Button variant="ghost">← Research workspace</Button>
        </Link>
      </div>

      <Card className="space-y-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Market
            </label>
            <input
              name="market"
              defaultValue={filters.market ?? ''}
              placeholder="KR"
              className="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Submarket
            </label>
            <input
              name="region"
              defaultValue={filters.region ?? ''}
              placeholder="Yeouido"
              className="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Asset class
            </label>
            <select
              name="assetClass"
              defaultValue={filters.assetClass ?? ''}
              className="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
            >
              <option value="">Any</option>
              {Object.values(AssetClass).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Apply</Button>
          {hasFilter ? (
            <Link href="/admin/research/comps">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          ) : null}
        </form>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <Badge>{formatNumber(aggregation.totals.transactionRows, 0)} txn rows</Badge>
          <Badge>{formatNumber(aggregation.totals.indicatorRows, 0)} indicator rows</Badge>
          <Badge>{aggregation.totals.distinctSubmarkets} submarkets</Badge>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Cap-rate matrix · deal-level (TransactionComp)</div>
          <p className="mt-1 text-sm text-slate-400">
            Median / range across deal-level cap rates, grouped by submarket × asset class × tier.
            Untiered rows surface together at the bottom of each market.
          </p>
        </div>
        <CapRateTable buckets={aggregation.fromTransactions} emptyLabel="No deal-level cap rates yet for this filter." />
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Cap-rate matrix · published market series</div>
          <p className="mt-1 text-sm text-slate-400">
            REB / MOLIT-published cap-rate observations grouped the same way. Compare against the
            deal-level table above — a published-vs-deal gap above 50 bps usually signals
            repricing or selection bias.
          </p>
        </div>
        <CapRateTable buckets={aggregation.fromIndicators} emptyLabel="No published cap-rate series for this filter." />
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Recent transactions</div>
          <p className="mt-1 text-sm text-slate-400">
            Last 24 deals matching the filter, newest first. Asset link present when the comp is
            tied to one of our underwritten assets.
          </p>
        </div>
        {recentTransactions.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No matching transactions. Try removing filters or extending the lookback by adjusting
            the URL.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Submarket</th>
                  <th className="px-4 py-3 font-semibold">Class / tier</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Cap %</th>
                  <th className="px-4 py-3 font-semibold">Asset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {recentTransactions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {row.transactionDate ? formatDate(row.transactionDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.market}/{row.region}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.assetClass ?? '—'} / {row.assetTier ?? 'Untiered'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{row.comparableType}</td>
                    <td className="px-4 py-3 text-right">{formatPriceKrw(row.priceKrw)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {row.capRatePct ? formatCapPct(row.capRatePct) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.asset ? (
                        <Link
                          href={`/admin/assets/${row.asset.assetCode}`}
                          className="text-accent hover:underline"
                        >
                          {row.asset.assetCode}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CapRateTable({
  buckets,
  emptyLabel
}: {
  buckets: Awaited<ReturnType<typeof aggregateCapRates>>['fromTransactions'];
  emptyLabel: string;
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">Market</th>
            <th className="px-4 py-3 font-semibold">Submarket</th>
            <th className="px-4 py-3 font-semibold">Class / tier</th>
            <th className="px-4 py-3 text-right font-semibold">n</th>
            <th className="px-4 py-3 text-right font-semibold">Min</th>
            <th className="px-4 py-3 text-right font-semibold">Median</th>
            <th className="px-4 py-3 text-right font-semibold">Max</th>
            <th className="px-4 py-3 font-semibold">Latest</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {buckets.map((bucket, index) => (
            <tr key={`${bucket.market}-${bucket.region}-${bucket.assetClass}-${bucket.assetTier}-${index}`}>
              <td className="px-4 py-3 text-xs">{bucket.market}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{bucket.region ?? '—'}</td>
              <td className="px-4 py-3 text-xs">
                {bucket.assetClass ?? '—'} / {bucket.assetTier ?? 'Untiered'}
              </td>
              <td className="px-4 py-3 text-right text-xs">{bucket.count}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{formatCapPct(bucket.minPct)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-white">
                {formatCapPct(bucket.medianPct)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">{formatCapPct(bucket.maxPct)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {bucket.latestObservedAt ? formatDate(bucket.latestObservedAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
