import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { FundWaterfallData, FundWaterfallTier } from '@/lib/services/fund-waterfall';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

type Props = {
  data: FundWaterfallData;
};

const TIER_COLORS: Record<
  FundWaterfallTier['key'],
  { bar: string; text: string; badge: 'neutral' | 'good' | 'warn' | 'danger' }
> = {
  returnOfCapital: { bar: 'bg-cyan-400/80', text: 'text-cyan-200', badge: 'neutral' },
  preferredReturn: { bar: 'bg-emerald-400/80', text: 'text-emerald-200', badge: 'good' },
  gpCatchUp: { bar: 'bg-amber-400/80', text: 'text-amber-200', badge: 'warn' },
  carriedInterest: { bar: 'bg-rose-400/80', text: 'text-rose-200', badge: 'danger' }
};

export function FundWaterfallPanel({ data }: Props) {
  const { fund, totals, tiers, investors, hurdleRatePct, carriedInterestPct } = data;
  const totalDistributed = tiers.reduce((sum, tier) => sum + tier.totalKrw, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="fine-print">Total Committed</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatCurrency(totals.committedKrw)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {formatNumber(totals.investorCount, 0)} investors across{' '}
            {formatNumber(totals.vehicleCount, 0)} vehicles
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Called</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatCurrency(totals.calledKrw)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {totals.committedKrw > 0
              ? formatPercent((totals.calledKrw / totals.committedKrw) * 100)
              : '0%'}{' '}
            drawn
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Distributed</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatCurrency(totals.distributedKrw)}
          </div>
          <div className="mt-2 text-xs text-slate-400">DPI {totals.dpiMultiple.toFixed(2)}x</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">NAV</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatCurrency(totals.navKrw)}
          </div>
          <div className="mt-2 text-xs text-slate-400">TVPI {totals.tvpiMultiple.toFixed(2)}x</div>
        </div>
      </div>

      <Card className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Distribution Waterfall</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">{fund.name}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Four-tier waterfall across return of capital, preferred return at {hurdleRatePct}%
              hurdle, GP catch-up, and a {100 - carriedInterestPct}/{carriedInterestPct} carried
              interest split on residual distributions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{fund.code}</Badge>
            {fund.strategy ? <Badge tone="neutral">{fund.strategy}</Badge> : null}
            {fund.vintageYear ? (
              <Badge tone="neutral">{`Vintage ${fund.vintageYear}`}</Badge>
            ) : null}
          </div>
        </div>

        {totalDistributed > 0 ? (
          <div className="space-y-3">
            <div className="flex h-4 w-full overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              {tiers.map((tier) => {
                const widthPct = (tier.totalKrw / totalDistributed) * 100;
                if (widthPct <= 0) return null;
                return (
                  <div
                    key={tier.key}
                    className={`${TIER_COLORS[tier.key].bar} h-full`}
                    style={{ width: `${widthPct}%` }}
                    aria-label={`${tier.label}: ${widthPct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {tiers.map((tier) => {
                const color = TIER_COLORS[tier.key];
                return (
                  <div
                    key={tier.key}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono uppercase tracking-[0.2em] ${color.text}`}
                      >
                        {tier.label}
                      </span>
                      <Badge tone={color.badge}>{`${tier.sharePct.toFixed(1)}%`}</Badge>
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-white">
                      {formatCurrency(tier.totalKrw)}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>LP</span>
                        <span className="text-slate-200">{formatCurrency(tier.lpAmountKrw)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GP</span>
                        <span className="text-slate-200">{formatCurrency(tier.gpAmountKrw)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-400">
            No distributions have been recorded yet. Waterfall tiers will populate once the fund
            begins returning capital to limited partners.
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Investor Ledger</div>
            <h3 className="mt-2 text-xl font-semibold text-white">Commitments by LP</h3>
          </div>
          <Badge tone="neutral">{`${investors.length} investors`}</Badge>
        </div>
        {investors.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-400">
            No commitments have been booked against this fund.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
                  <th className="border-b border-white/10 px-3 py-3">Investor</th>
                  <th className="border-b border-white/10 px-3 py-3 text-right">Committed</th>
                  <th className="border-b border-white/10 px-3 py-3 text-right">Called</th>
                  <th className="border-b border-white/10 px-3 py-3 text-right">Distributed</th>
                  <th className="border-b border-white/10 px-3 py-3 text-right">Remaining</th>
                  <th className="border-b border-white/10 px-3 py-3 text-right">% of Fund</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((investor) => (
                  <tr key={investor.investorId} className="text-slate-200">
                    <td className="border-b border-white/5 px-3 py-3">
                      <div className="font-medium text-white">{investor.investorName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono uppercase tracking-[0.18em]">
                          {investor.investorCode}
                        </span>
                        {investor.investorType ? <span>{investor.investorType}</span> : null}
                      </div>
                    </td>
                    <td className="border-b border-white/5 px-3 py-3 text-right">
                      {formatCurrency(investor.committedKrw)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-3 text-right">
                      {formatCurrency(investor.calledKrw)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-3 text-right">
                      {formatCurrency(investor.distributedKrw)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-3 text-right">
                      {formatCurrency(investor.remainingCommitmentKrw)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-3 text-right font-mono text-xs text-cyan-200">
                      {investor.sharePct.toFixed(2)}%
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
