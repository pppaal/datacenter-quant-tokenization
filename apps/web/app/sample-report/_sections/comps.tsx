import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function CompsSection({ data }: { data: SampleReportData }) {
  const {
    asset,
    displayCurrency,
    fxRateToKrw,
    txCompsToShow,
    rentCompsToShow,
    hedonicCompInputs,
    hedonicFit
  } = data;
  if (!(txCompsToShow.length > 0 || rentCompsToShow.length > 0)) {
    return null;
  }
  return (
    <section id="im-comps" className="app-shell py-4">
      <Card>
        <div className="eyebrow">Comparable transactions &amp; rent comps</div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Submarket comparables anchoring cap-rate and rent underwriting. Transaction comps support
          the value approach; rent comps support WALT and mark-to-market. Each row references its
          source.
          {asset.transactionComps?.length === 0 && txCompsToShow.length > 0
            ? ' Submarket-wide comparables shown for pre-stabilization assets without direct comps.'
            : ''}
        </p>

        <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="fine-print">Hedonic-fitted comparable price</div>
              <p className="mt-1 max-w-3xl text-xs text-slate-400">
                OLS log-linear regression of comp price/sqm on size, vintage, submarket, tier, and
                deal-structure dummies. Returns the fitted price/sqm for this asset controlled for
                those features — independent of the raw comp average.
              </p>
            </div>
            {hedonicFit ? (
              <Badge tone="good">
                {hedonicCompInputs.length} comps · R² {hedonicFit.rSquared.toFixed(2)}
              </Badge>
            ) : (
              <Badge tone="warn">Insufficient comp data</Badge>
            )}
          </div>
          {hedonicFit ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Fitted price / sqm
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-white">
                  {formatNumber(hedonicFit.fittedPricePerSqmKrw, 0)} KRW
                </div>
              </div>
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Adjusted R²
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  {hedonicFit.adjustedRSquared.toFixed(3)}
                </div>
              </div>
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Residual SE (log)
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  {hedonicFit.residualStdErr.toFixed(3)}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              Need at least {Math.max(4 - hedonicCompInputs.length, 1)} more comparable transactions
              to identify the regression. Add MOLIT 실거래가 ingest for faster fill.
            </p>
          )}
        </div>

        {txCompsToShow.length > 0 ? (
          <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Submarket</th>
                  <th className="px-2 py-2 font-semibold">Type / tier</th>
                  <th className="px-2 py-2 text-right font-semibold">Price</th>
                  <th className="px-2 py-2 text-right font-semibold">Cap rate</th>
                  <th className="px-2 py-2 text-right font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {txCompsToShow.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td className="px-2 py-2 text-slate-400">
                      {c.transactionDate ? formatDate(c.transactionDate) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white">{c.region}</div>
                      <div className="text-[10px] text-slate-500">{c.market}</div>
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      <div>{c.comparableType}</div>
                      {c.assetTier ? (
                        <div className="text-[10px] text-slate-500">{c.assetTier}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {typeof c.priceKrw === 'number' && c.priceKrw > 0
                        ? formatCompactCurrencyFromKrwAtRate(
                            c.priceKrw,
                            displayCurrency,
                            fxRateToKrw
                          )
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {typeof c.capRatePct === 'number' ? `${c.capRatePct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                      {c.sourceSystem}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rentCompsToShow.length > 0 ? (
          <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">As of</th>
                  <th className="px-2 py-2 font-semibold">Submarket</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 text-right font-semibold">Rent / kW</th>
                  <th className="px-2 py-2 text-right font-semibold">Rent / sqm</th>
                  <th className="px-2 py-2 text-right font-semibold">Occ</th>
                  <th className="px-2 py-2 text-right font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {rentCompsToShow.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 text-slate-400">
                      {r.observationDate ? formatDate(r.observationDate) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white">{r.region}</div>
                      <div className="text-[10px] text-slate-500">{r.market}</div>
                    </td>
                    <td className="px-2 py-2 text-slate-300">{r.comparableType}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {typeof r.monthlyRatePerKwKrw === 'number'
                        ? `${formatNumber(r.monthlyRatePerKwKrw, 0)}`
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {typeof r.monthlyRentPerSqmKrw === 'number'
                        ? `${formatNumber(r.monthlyRentPerSqmKrw, 0)}`
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {typeof r.occupancyPct === 'number' ? `${r.occupancyPct.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                      {r.sourceSystem}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
