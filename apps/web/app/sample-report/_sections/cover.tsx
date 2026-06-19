import Link from 'next/link';
import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import type { SampleReportData } from './types';

export function CoverSection({ data }: { data: SampleReportData }) {
  const {
    asset,
    latestRun,
    compareAsset,
    compareLatestRun,
    compareProForma,
    compareReturnsSnapshot,
    compareLeaseRoll,
    bullValue,
    bearValue,
    recommendation,
    isDataCenter,
    displayCurrency,
    fxRateToKrw,
    leaseRoll,
    returnsSnapshot,
    proForma
  } = data;
  return (
    <section id="im-cover" className="app-shell py-10">
      <div className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Investment Memo</Badge>
          <Badge>{asset.assetCode}</Badge>
          <Badge>{latestRun.runLabel}</Badge>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div>
              <div className="fine-print">Committee Draft · {formatDate(latestRun.createdAt)}</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                {asset.name}
              </h1>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-slate-300">{asset.description}</p>

            <div className="print-hidden flex flex-wrap gap-3" data-im-print-hidden>
              <PrintImButton />
              <Link href="/admin">
                <Button variant="ghost">Operator console</Button>
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="metric-card">
                <div className="fine-print">Recommendation</div>
                <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
                <p className="mt-2 text-sm text-slate-400">
                  Confidence, scenario spread, and diligence posture aggregated.
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Base Case Value</div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {formatCurrencyFromKrwAtRate(
                    latestRun.baseCaseValueKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Underwriting base case anchoring the committee view.
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Confidence Score</div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {formatNumber(latestRun.confidenceScore, 1)}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Composite of input coverage, freshness, and fallback usage.
                </p>
              </div>
            </div>

            {/* Dense KPI strip — the "above-the-fold" numbers an LP
                  scans before reading the memo. Each cell links to the
                  card that explains it. */}
            <div className="grid gap-px overflow-hidden rounded-[18px] border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: 'Equity IRR',
                  value:
                    proForma?.summary.equityIrr !== undefined &&
                    proForma?.summary.equityIrr !== null
                      ? formatPercent(proForma.summary.equityIrr)
                      : '—',
                  href: '#im-sources-uses'
                },
                {
                  label: 'Multiple',
                  value:
                    proForma?.summary.equityMultiple && proForma.summary.equityMultiple > 0
                      ? `${proForma.summary.equityMultiple.toFixed(2)}x`
                      : '—',
                  href: '#im-sources-uses'
                },
                {
                  label: 'Going-in yield',
                  value:
                    returnsSnapshot.goingInYieldPct !== null
                      ? formatPercent(returnsSnapshot.goingInYieldPct)
                      : '—',
                  href: '#im-returns'
                },
                {
                  label: 'Exit cap',
                  value:
                    returnsSnapshot.exitCapPct !== null
                      ? formatPercent(returnsSnapshot.exitCapPct)
                      : '—',
                  href: '#im-returns'
                },
                {
                  label: 'Min DSCR',
                  value:
                    returnsSnapshot.minDscr !== null
                      ? `${returnsSnapshot.minDscr.toFixed(2)}x`
                      : '—',
                  href: '#im-returns'
                },
                {
                  label: 'WALT',
                  value:
                    leaseRoll.weightedAvgTermYears > 0
                      ? `${leaseRoll.weightedAvgTermYears.toFixed(1)}y`
                      : '—',
                  href: '#im-returns'
                }
              ].map((kpi) => (
                <a
                  key={kpi.label}
                  href={kpi.href}
                  className="group bg-slate-950/80 px-3 py-2.5 transition hover:bg-slate-900"
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {kpi.label}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-white">{kpi.value}</div>
                </a>
              ))}
            </div>

            {compareAsset && compareLatestRun ? (
              <div className="mt-5 rounded-[18px] border border-white/15 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    Compare vs.{' '}
                    <span className="font-mono text-slate-200">{compareAsset.assetCode}</span>
                    {' — '}
                    <span className="text-slate-300">{compareAsset.name}</span>
                  </div>
                  <a
                    href={`/sample-report`}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    clear ✕
                  </a>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  {[
                    {
                      label: 'Equity IRR',
                      thisVal: proForma?.summary.equityIrr ?? null,
                      otherVal: compareProForma?.summary.equityIrr ?? null,
                      fmt: (v: number) => formatPercent(v)
                    },
                    {
                      label: 'Multiple',
                      thisVal: proForma?.summary.equityMultiple ?? null,
                      otherVal: compareProForma?.summary.equityMultiple ?? null,
                      fmt: (v: number) => `${v.toFixed(2)}x`
                    },
                    {
                      label: 'Going-in yield',
                      thisVal: returnsSnapshot.goingInYieldPct,
                      otherVal: compareReturnsSnapshot?.goingInYieldPct ?? null,
                      fmt: (v: number) => formatPercent(v)
                    },
                    {
                      label: 'Exit cap',
                      thisVal: returnsSnapshot.exitCapPct,
                      otherVal: compareReturnsSnapshot?.exitCapPct ?? null,
                      fmt: (v: number) => formatPercent(v)
                    },
                    {
                      label: 'Min DSCR',
                      thisVal: returnsSnapshot.minDscr,
                      otherVal: compareReturnsSnapshot?.minDscr ?? null,
                      fmt: (v: number) => `${v.toFixed(2)}x`
                    },
                    {
                      label: 'WALT',
                      thisVal:
                        leaseRoll.weightedAvgTermYears > 0 ? leaseRoll.weightedAvgTermYears : null,
                      otherVal:
                        (compareLeaseRoll?.weightedAvgTermYears ?? 0) > 0
                          ? compareLeaseRoll!.weightedAvgTermYears
                          : null,
                      fmt: (v: number) => `${v.toFixed(1)}y`
                    }
                  ].map((kpi) => {
                    const delta =
                      kpi.thisVal !== null && kpi.otherVal !== null
                        ? kpi.thisVal - kpi.otherVal
                        : null;
                    return (
                      <div
                        key={kpi.label}
                        className="rounded-[14px] border border-white/5 bg-white/[0.015] px-3 py-2"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">
                          {kpi.label}
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-xs">
                          <span className="font-semibold text-white">
                            {kpi.thisVal !== null ? kpi.fmt(kpi.thisVal) : '—'}
                          </span>
                          <span className="text-slate-500">
                            {kpi.otherVal !== null ? kpi.fmt(kpi.otherVal) : '—'}
                          </span>
                        </div>
                        {delta !== null ? (
                          <div
                            className={`mt-1 text-[10px] font-mono ${
                              delta > 0
                                ? 'text-emerald-300'
                                : delta < 0
                                  ? 'text-rose-300'
                                  : 'text-slate-400'
                            }`}
                          >
                            Δ {delta > 0 ? '+' : ''}
                            {kpi.fmt(delta).replace(/[+\-]/g, (s) => s)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <Card className="grid gap-4">
            <div>
              <div className="eyebrow">Memo Cover</div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Prepared On</span>
                  <span>{formatDate(latestRun.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Location</span>
                  <span>{asset.address?.city ?? 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>{isDataCenter ? 'Power Capacity' : 'Rentable Area'}</span>
                  <span>
                    {isDataCenter
                      ? `${formatNumber(asset.powerCapacityMw)} MW`
                      : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Model Version</span>
                  <span>{latestRun.engineVersion}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-accent/20 bg-accent/10 p-5">
              <div className="fine-print text-accent">Recommendation</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                {recommendation}. Scenario range spans{' '}
                {bearValue !== null && bullValue !== null
                  ? `${formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw)} – ${formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw)}`
                  : 'within scenario bounds'}{' '}
                across the bear and bull cases. Confidence{' '}
                {formatNumber(latestRun.confidenceScore, 1)} reflects current source coverage and
                diligence completion.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
