import { Badge } from '@/components/ui/badge';
import { MacroTrendChart } from '@/components/admin/macro-trend-chart';
import type { MacroDashboardData } from '@/lib/services/macro-dashboard';

type Props = {
  data: MacroDashboardData;
};

export function MacroDashboardPanel({ data }: Props) {
  return (
    <div className="space-y-6">
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
