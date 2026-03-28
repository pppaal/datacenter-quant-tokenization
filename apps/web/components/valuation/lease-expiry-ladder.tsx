'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type { BundleLease } from '@/lib/services/valuation/types';
import { formatNumber } from '@/lib/utils';
import { buildLeaseExpiryLadder } from '@/lib/valuation/lease-expiry-ladder';

function formatMaybe(value: number | null, digits = 1) {
  return value === null ? 'N/A' : formatNumber(value, digits);
}

export function LeaseExpiryLadder({
  leases,
  leaseBasePath,
  rolloverBasePath,
  selectedRolloverYear,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  leases: BundleLease[];
  leaseBasePath?: string;
  rolloverBasePath?: string;
  selectedRolloverYear?: number | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const ladder = buildLeaseExpiryLadder(leases);

  if (ladder.rows.length === 0) {
    return (
      <Card id="lease-expiry-ladder">
        <div className="eyebrow">Lease Expiry Ladder</div>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          No lease rows yet. Add contracted demand first to see expiry and rollover concentration.
        </div>
      </Card>
    );
  }

  return (
    <Card id="lease-expiry-ladder">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Lease Expiry Ladder</div>
          <div className="mt-2 text-sm text-slate-400">
            Expiry concentration, renewal assumptions, and modeled rollover window by lease year.
          </div>
        </div>
        <div className="text-sm text-slate-400">{formatNumber(ladder.rows.length, 0)} expiry buckets</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total Contracted kW</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatNumber(ladder.totalContractedKw, 0)} kW</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Near-Term Expiry</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatNumber(ladder.nearTermExpiryKw, 0)} kW</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Weighted Renewal Prob.</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatMaybe(ladder.weightedRenewProbabilityPct)}%</div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest Expiry Year</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {ladder.latestExpiryYear !== null ? `Year ${formatNumber(ladder.latestExpiryYear, 0)}` : 'N/A'}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2 text-right">Expiring kW</th>
              <th className="px-3 py-2 text-right">Leases</th>
              <th className="px-3 py-2 text-right">Renew Prob.</th>
              <th className="px-3 py-2 text-right">Roll Downtime</th>
              <th className="px-3 py-2 text-right">Renew Term</th>
              <th className="px-3 py-2 text-right">Renew Count</th>
              <th className="px-3 py-2 text-right">MTM Rate</th>
              <th className="px-3 py-2 text-right">Modeled Window</th>
            </tr>
          </thead>
          <tbody>
            {ladder.rows.map((row) => (
              <tr key={row.expiryYear} className="rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200">
                <td className="px-3 py-3 font-medium text-white">
                  {rolloverBasePath ? (
                    <Link
                      href={`${rolloverBasePath}?rolloverYear=${row.expiryYear}#lease-rollover-drilldown`}
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] transition ${
                        selectedRolloverYear === row.expiryYear
                          ? 'border-amber-300/40 bg-amber-200/15 text-white'
                          : 'border-white/10 bg-slate-950/40 text-slate-200 hover:border-amber-300/30 hover:text-white'
                      }`}
                    >
                      Year {row.expiryYear}
                    </Link>
                  ) : (
                    `Year ${row.expiryYear}`
                  )}
                </td>
                <td className="px-3 py-3 text-right">{formatNumber(row.expiringKw, 0)} kW</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.leaseCount, 0)}</td>
                <td className="px-3 py-3 text-right">{formatMaybe(row.weightedRenewProbabilityPct)}%</td>
                <td className="px-3 py-3 text-right">{formatMaybe(row.weightedRolloverDowntimeMonths, 1)} mo</td>
                <td className="px-3 py-3 text-right">{formatMaybe(row.weightedRenewalTermYears, 1)} yr</td>
                <td className="px-3 py-3 text-right">{formatMaybe(row.weightedRenewalCount, 1)}</td>
                <td className="px-3 py-3 text-right">
                  {row.weightedMarkToMarketRatePerKwKrw !== null
                    ? `${formatCurrencyFromKrwAtRate(row.weightedMarkToMarketRatePerKwKrw, displayCurrency, fxRateToKrw)} / kW`
                    : 'N/A'}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.firstRenewalStartYear !== null && row.lastModeledRenewalEndYear !== null ? (
                    rolloverBasePath ? (
                      <Link
                        href={`${rolloverBasePath}?rolloverYear=${row.expiryYear}#lease-rollover-drilldown`}
                        className="rounded-full border border-amber-400/15 bg-amber-500/[0.06] px-3 py-1 text-xs text-amber-50/85 transition hover:border-amber-300/30 hover:text-white"
                      >
                        {`Y${row.firstRenewalStartYear} - Y${row.lastModeledRenewalEndYear}`}
                      </Link>
                    ) : (
                      `Y${row.firstRenewalStartYear} - Y${row.lastModeledRenewalEndYear}`
                    )
                  ) : (
                    'N/A'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2 text-right">Expiry</th>
              <th className="px-3 py-2 text-right">kW</th>
              <th className="px-3 py-2 text-right">Renew Prob.</th>
              <th className="px-3 py-2 text-right">Downtime</th>
              <th className="px-3 py-2 text-right">MTM</th>
              <th className="px-3 py-2 text-right">Modeled Renewal Window</th>
            </tr>
          </thead>
          <tbody>
            {ladder.details.map((detail) => (
              <tr
                key={detail.leaseId}
                className="rounded-2xl border border-white/10 bg-slate-950/30 text-slate-300"
              >
                <td className="px-3 py-3 text-white">
                  {leaseBasePath ? (
                    <Link
                      href={`${leaseBasePath}#lease-${detail.leaseId}`}
                      className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs text-slate-200 transition hover:border-amber-300/30 hover:text-white"
                    >
                      {detail.tenantName}
                    </Link>
                  ) : (
                    detail.tenantName
                  )}
                </td>
                <td className="px-3 py-3 text-right">Year {detail.expiryYear}</td>
                <td className="px-3 py-3 text-right">{formatNumber(detail.expiringKw, 0)} kW</td>
                <td className="px-3 py-3 text-right">{formatMaybe(detail.renewProbabilityPct)}%</td>
                <td className="px-3 py-3 text-right">{formatMaybe(detail.rolloverDowntimeMonths, 1)} mo</td>
                <td className="px-3 py-3 text-right">
                  {detail.markToMarketRatePerKwKrw !== null
                    ? `${formatCurrencyFromKrwAtRate(detail.markToMarketRatePerKwKrw, displayCurrency, fxRateToKrw)} / kW`
                    : 'N/A'}
                </td>
                <td className="px-3 py-3 text-right">
                  {detail.firstRenewalStartYear !== null && detail.lastModeledRenewalEndYear !== null
                    ? `Y${detail.firstRenewalStartYear} - Y${detail.lastModeledRenewalEndYear}`
                    : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
