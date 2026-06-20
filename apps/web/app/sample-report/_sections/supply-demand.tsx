import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function SupplyDemandSection({ data }: { data: SampleReportData }) {
  const { supplyDemandModel, demandGrowthPct } = data;
  if (!supplyDemandModel) {
    return null;
  }
  return (
    <section id="im-supply-demand" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Supply-demand forecast</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Probability-weighted pipeline supply (stage-conditional completion rates) paired with
              a {formatNumber(demandGrowthPct, 1)}%{' '}
              {supplyDemandModel.unit === 'MW' ? 'AI-load' : 'baseline'} demand growth assumption to
              project net absorption and implied vacancy over a 5-year hold.
            </p>
          </div>
          <Badge>
            Year-1 pipeline = {formatNumber(supplyDemandModel.pipelineIntensityPct, 1)}% of supply
          </Badge>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Year</th>
                <th className="px-2 py-2 text-right font-semibold">
                  + Supply ({supplyDemandModel.unit})
                </th>
                <th className="px-2 py-2 text-right font-semibold">
                  Cumulative ({supplyDemandModel.unit})
                </th>
                <th className="px-2 py-2 text-right font-semibold">
                  Demand ({supplyDemandModel.unit})
                </th>
                <th className="px-2 py-2 text-right font-semibold">Net abs.</th>
                <th className="px-2 py-2 text-right font-semibold">Vacancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {supplyDemandModel.supplyDemand.map((row) => {
                const tightening = row.netAbsorption > 0;
                return (
                  <tr key={row.year}>
                    <td className="px-2 py-2 text-slate-400">{row.year}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {row.expectedSupplyDelta > 0
                        ? `+${formatNumber(row.expectedSupplyDelta, 1)}`
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatNumber(row.cumulativeSupply, 1)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatNumber(row.expectedDemand, 1)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-mono ${
                        tightening ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {tightening ? '+' : ''}
                      {formatNumber(row.netAbsorption, 1)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatNumber(row.impliedVacancyPct, 1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Stage-weighted: ANNOUNCED 30% · PERMITTED 65% · UNDER_CONSTRUCTION 90% · COMMISSIONING
          98%. Override with sponsor-specific completion rates as new evidence arrives. Baseline
          demand seeded at 80% of starting supply (proxy for current take-up); replace with KEPCO
          load forecast when available.
        </p>
      </Card>
    </section>
  );
}
