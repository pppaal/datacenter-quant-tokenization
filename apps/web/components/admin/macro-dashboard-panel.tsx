import { Badge } from '@/components/ui/badge';
import { MacroTrendChart } from '@/components/admin/macro-trend-chart';
import type { MacroDashboardData } from '@/lib/services/macro-dashboard';

type Props = {
  data: MacroDashboardData;
};

export function MacroDashboardPanel({ data }: Props) {
  return (
    <div className="space-y-6">
      {data.narrative ? (
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6">
          <div className="eyebrow">Macro Narrative</div>
          <h3 className="mt-2 text-lg font-semibold text-white">{data.narrative.headline}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-400">{data.narrative.whatChanged}</p>
          <p className="mt-2 text-sm leading-7 text-slate-400">{data.narrative.portfolioImplication}</p>
          {data.narrative.watchItems.length > 0 ? (
            <div className="mt-4">
              <div className="fine-print">Watch Items</div>
              <ul className="mt-2 space-y-1">
                {data.narrative.watchItems.map((item, i) => (
                  <li key={i} className="text-sm leading-6 text-slate-400">• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.narrative.riskCallout ? (
            <div className="mt-4 rounded-[14px] border border-orange-500/20 bg-orange-500/5 px-4 py-3">
              <div className="text-sm font-medium text-orange-400">Risk Callout</div>
              <p className="mt-1 text-sm leading-6 text-orange-300/80">{data.narrative.riskCallout}</p>
            </div>
          ) : null}
          {data.narrative.cached ? (
            <Badge>cached</Badge>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="fine-print">Total Series</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {data.summary.totalSeriesCount}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Latest Observation</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {data.summary.latestObservationDate ?? 'No data'}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Stale Series</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            <Badge
              tone={data.summary.staleSeriesCount === 0 ? 'good' : 'warn'}
            >
              {data.summary.staleSeriesCount}
            </Badge>
          </div>
        </div>
      </div>

      {data.interestRateSeries.length > 0 && (
        <MacroTrendChart
          title="Interest Rate Trends"
          subtitle="Monetary Policy & Base Rates"
          series={data.interestRateSeries}
        />
      )}

      {data.vacancySeries.length > 0 && (
        <MacroTrendChart
          title="Vacancy Rate Trends"
          subtitle="Occupancy & Supply Dynamics"
          series={data.vacancySeries}
        />
      )}

      {data.capRateSeries.length > 0 && (
        <MacroTrendChart
          title="Cap Rate Trends"
          subtitle="Market Pricing & Yields"
          series={data.capRateSeries}
        />
      )}

      {data.marketIndicators.length > 0 && (
        <MacroTrendChart
          title="Additional Market Indicators"
          subtitle="Supplementary Coverage"
          series={data.marketIndicators}
        />
      )}
    </div>
  );
}
