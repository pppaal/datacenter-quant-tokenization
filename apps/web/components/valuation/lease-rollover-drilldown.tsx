'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type { BundleLease } from '@/lib/services/valuation/types';
import { formatNumber } from '@/lib/utils';
import { buildLeaseRolloverDrilldown } from '@/lib/valuation/lease-rollover-drilldown';

export function LeaseRolloverDrilldown({
  leases,
  focusYear,
  leaseBasePath,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  leases: BundleLease[];
  focusYear?: number | null;
  leaseBasePath?: string;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const drilldown = buildLeaseRolloverDrilldown(leases);
  const filteredRows =
    focusYear && drilldown.rows.some((row) => row.year === focusYear)
      ? drilldown.rows.filter((row) => row.year === focusYear)
      : drilldown.rows;
  const summary = {
    firstPeriodLabel: filteredRows[0]?.periodLabel ?? null,
    peakDowntimeKw: filteredRows.reduce((max, row) => Math.max(max, row.downtimeKw), 0),
    peakRentFreeKw: filteredRows.reduce((max, row) => Math.max(max, row.rentFreeKw), 0),
    totalRenewalCapitalKrw: filteredRows.reduce((sum, row) => sum + row.tenantCapitalCostKrw, 0)
  };

  if (drilldown.rows.length === 0) {
    return (
      <Card id="lease-rollover-drilldown">
        <div className="eyebrow">Monthly Rollover Drill-Down</div>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          No modeled renewal window yet. Add renewal probability and rollover assumptions to see monthly disruption.
        </div>
      </Card>
    );
  }

  return (
    <Card id="lease-rollover-drilldown">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Monthly Rollover Drill-Down</div>
          <div className="mt-2 text-sm text-slate-400">
            Synthetic month-by-month schedule derived from renewal downtime, rent-free, and renewal TI/LC assumptions.
          </div>
          {focusYear && filteredRows.length > 0 ? (
            <div className="mt-3 inline-flex rounded-full border border-amber-400/20 bg-amber-500/[0.08] px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-100/80">
              Focused on Year {focusYear}
            </div>
          ) : null}
        </div>
        <div className="text-sm text-slate-400">{formatNumber(filteredRows.length, 0)} modeled months</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">First Modeled Month</div>
          <div className="mt-2 text-lg font-semibold text-white">{summary.firstPeriodLabel ?? 'N/A'}</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Peak Downtime kW</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatNumber(summary.peakDowntimeKw, 0)} kW</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Peak Rent-Free kW</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatNumber(summary.peakRentFreeKw, 0)} kW</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Renewal TI / LC</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {formatCurrencyFromKrwAtRate(summary.totalRenewalCapitalKrw, displayCurrency, fxRateToKrw)}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Downtime kW</th>
              <th className="px-3 py-2 text-right">Rent-Free kW</th>
              <th className="px-3 py-2 text-right">Returning kW</th>
              <th className="px-3 py-2 text-right">Renewal TI / LC</th>
              <th className="px-3 py-2 text-right">MTM Rate</th>
              <th className="px-3 py-2 text-right">Leases</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.monthIndex} className="rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200">
                <td className="px-3 py-3 font-medium text-white">{row.periodLabel}</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.downtimeKw, 0)} kW</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.rentFreeKw, 0)} kW</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.returningKw, 0)} kW</td>
                <td className="px-3 py-3 text-right">
                  {formatCurrencyFromKrwAtRate(row.tenantCapitalCostKrw, displayCurrency, fxRateToKrw)}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.weightedMarkToMarketRatePerKwKrw !== null
                    ? `${formatCurrencyFromKrwAtRate(row.weightedMarkToMarketRatePerKwKrw, displayCurrency, fxRateToKrw)} / kW`
                    : 'N/A'}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {row.leaseRefs.map((leaseRef) =>
                      leaseBasePath ? (
                        <Link
                          key={`${row.monthIndex}-${leaseRef.id}`}
                          href={`${leaseBasePath}#lease-${leaseRef.id}`}
                          className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs text-slate-200 transition hover:border-amber-300/30 hover:text-white"
                        >
                          {leaseRef.tenantName}
                        </Link>
                      ) : (
                        <span
                          key={`${row.monthIndex}-${leaseRef.id}`}
                          className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs text-slate-200"
                        >
                          {leaseRef.tenantName}
                        </span>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
