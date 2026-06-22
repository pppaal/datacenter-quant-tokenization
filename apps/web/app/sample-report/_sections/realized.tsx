import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function RealizedSection({ data }: { data: SampleReportData }) {
  const { asset, displayCurrency, fxRateToKrw, pipelineToShow } = data;
  if (
    !((asset.realizedOutcomes && asset.realizedOutcomes.length > 0) || pipelineToShow.length > 0)
  ) {
    return null;
  }
  return (
    <section id="im-realized" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {asset.realizedOutcomes && asset.realizedOutcomes.length > 0 ? (
          <Card>
            <div className="eyebrow">Realized outcomes</div>
            <p className="mt-2 text-sm text-slate-400">
              Realized occupancy, NOI, and DSCR observations on the asset. Used to calibrate
              underwriting against actual performance.
            </p>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 text-right font-semibold">Occ</th>
                    <th className="px-2 py-2 text-right font-semibold">NOI</th>
                    <th className="px-2 py-2 text-right font-semibold">DSCR</th>
                    <th className="px-2 py-2 text-right font-semibold">Exit cap</th>
                    <th className="px-2 py-2 text-right font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
                  {asset.realizedOutcomes.map((o) => (
                    <tr key={o.id}>
                      <td className="px-2 py-2 text-slate-400">{formatDate(o.observationDate)}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {typeof o.occupancyPct === 'number' ? `${o.occupancyPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {typeof o.noiKrw === 'number'
                          ? formatCompactCurrencyFromKrwAtRate(
                              o.noiKrw,
                              displayCurrency,
                              fxRateToKrw
                            )
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {typeof o.debtServiceCoverage === 'number'
                          ? `${o.debtServiceCoverage.toFixed(2)}x`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {typeof o.exitCapRatePct === 'number'
                          ? `${o.exitCapRatePct.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                        {o.sourceSystem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {pipelineToShow.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Competitive supply pipeline</div>
              <Badge>
                {pipelineToShow.length} project{pipelineToShow.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Announced supply competing for absorption during the hold period.
              {asset.pipelineProjects?.length === 0 && pipelineToShow.length > 0
                ? ' Submarket-wide entries shown where no asset-tied projects are recorded.'
                : ''}
            </p>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Project</th>
                    <th className="px-2 py-2 font-semibold">Submarket</th>
                    <th className="px-2 py-2 font-semibold">Stage</th>
                    <th className="px-2 py-2 text-right font-semibold">MW / Sqm</th>
                    <th className="px-2 py-2 text-right font-semibold">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
                  {pipelineToShow.map((p) => (
                    <tr key={p.id}>
                      <td className="px-2 py-2">
                        <div className="text-white">{p.projectName}</div>
                        {p.sponsorName ? (
                          <div className="text-[10px] text-slate-500">{p.sponsorName}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-slate-300">{p.region ?? p.market}</td>
                      <td className="px-2 py-2 text-slate-300">{p.stageLabel ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {typeof p.expectedPowerMw === 'number'
                          ? `${p.expectedPowerMw.toFixed(0)} MW`
                          : typeof p.expectedAreaSqm === 'number'
                            ? `${formatNumber(p.expectedAreaSqm, 0)} sqm`
                            : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {p.expectedDeliveryDate ? formatDate(p.expectedDeliveryDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
