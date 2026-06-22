import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function FxSection({ data }: { data: SampleReportData }) {
  const { fxExposure } = data;
  if (!fxExposure) {
    return null;
  }
  // baseCurrencyValue is already translated into the LP base currency by
  // buildFxExposure, so format it as a proper compact currency amount rather
  // than the previous hand-rolled "/1e6 … M" string (which bypassed the
  // report's currency formatting and read ambiguously across USD/EUR/JPY).
  const formatBase = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: fxExposure.lpBaseCurrency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  return (
    <section id="im-fx" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">FX exposure</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">{fxExposure.notes}</p>
          </div>
          <Badge
            tone={
              fxExposure.exposureBand === 'high'
                ? 'warn'
                : fxExposure.exposureBand === 'low'
                  ? 'good'
                  : undefined
            }
          >
            {fxExposure.exposureBand.toUpperCase()} exposure
          </Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Asset currency</div>
            <div className="mt-2 font-mono text-lg font-semibold text-white">
              {fxExposure.assetCurrency}
            </div>
          </div>
          <div className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              LP base currency
            </div>
            <div className="mt-2 font-mono text-lg font-semibold text-white">
              {fxExposure.lpBaseCurrency}
            </div>
          </div>
          <div className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Spot</div>
            <div className="mt-2 font-mono text-sm text-white">{fxExposure.spotRateLabel}</div>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">FX shock</th>
                {fxExposure.sensitivity.map((s) => (
                  <th key={s.shockPct} className="px-2 py-2 text-right font-semibold">
                    {s.shockPct >= 0 ? '+' : ''}
                    {s.shockPct}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-2 text-slate-400">
                  Asset value in {fxExposure.lpBaseCurrency}
                </td>
                {fxExposure.sensitivity.map((s) => {
                  const tone =
                    s.shockPct < 0
                      ? 'text-emerald-300'
                      : s.shockPct > 0
                        ? 'text-rose-300'
                        : 'text-white';
                  return (
                    <td key={s.shockPct} className={`px-2 py-2 text-right font-mono ${tone}`}>
                      {formatBase(s.baseCurrencyValue)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-slate-500">
          Negative shock = KRW strengthens vs {fxExposure.lpBaseCurrency} (translation gain).
          Positive shock = KRW weakens (translation loss). No deal-level NDF / forward hedge is
          modeled.
        </p>
      </Card>
    </section>
  );
}
