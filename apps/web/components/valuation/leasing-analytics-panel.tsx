import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { buildLeasingAnalytics } from '@/lib/services/valuation/leasing-analytics';
import type { BundleLease } from '@/lib/services/valuation/types';
import { formatNumber, formatPercent } from '@/lib/utils';

type Props = {
  leases: BundleLease[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

function diversificationTone(
  label: ReturnType<typeof buildLeasingAnalytics>['diversificationLabel']
): 'good' | 'warn' | 'danger' | 'neutral' {
  if (label === 'Well diversified') return 'good';
  if (label === 'Moderate') return 'neutral';
  if (label === 'Concentrated') return 'warn';
  if (label === 'Single-tenant risk') return 'danger';
  return 'neutral';
}

export function LeasingAnalyticsPanel({ leases, displayCurrency = 'KRW', fxRateToKrw }: Props) {
  const a = buildLeasingAnalytics(leases);
  if (!a.tenantCount || a.inPlaceAnnualIncomeKrw <= 0) return null;

  const money = (krw: number | null | undefined) =>
    krw == null ? '—' : formatCompactCurrencyFromKrwAtRate(krw, displayCurrency, fxRateToKrw);

  const reversionPct =
    a.weightedMarkToMarketRatePerKwKrw != null &&
    a.inPlaceWeightedRatePerKwKrw != null &&
    a.inPlaceWeightedRatePerKwKrw > 0
      ? ((a.weightedMarkToMarketRatePerKwKrw - a.inPlaceWeightedRatePerKwKrw) /
          a.inPlaceWeightedRatePerKwKrw) *
        100
      : null;

  const kpis: Array<{ label: string; value: string; hint?: string }> = [
    {
      label: 'In-Place Income (yr)',
      value: money(a.inPlaceAnnualIncomeKrw),
      hint: `${a.tenantCount} tenant${a.tenantCount === 1 ? '' : 's'}`
    },
    {
      label: 'WALT — by income',
      value: a.waltByIncomeYears != null ? `${formatNumber(a.waltByIncomeYears, 1)} yr` : '—',
      hint:
        a.waltByAreaYears != null ? `${formatNumber(a.waltByAreaYears, 1)} yr by area` : undefined
    },
    {
      label: 'Top Tenant',
      value: a.topTenantSharePct != null ? formatPercent(a.topTenantSharePct) : '—',
      hint: a.topThreeSharePct != null ? `${formatPercent(a.topThreeSharePct)} top 3` : undefined
    },
    {
      label: `Rollover ≤ ${a.nearTermYears}yr`,
      value: a.nearTermRolloverSharePct != null ? formatPercent(a.nearTermRolloverSharePct) : '—',
      hint: 'of income'
    },
    {
      label: 'Reversion (MTM)',
      value:
        reversionPct != null
          ? `${reversionPct >= 0 ? '+' : ''}${formatNumber(reversionPct, 1)}%`
          : '—',
      hint: 'in-place vs market'
    }
  ];

  return (
    <Card data-testid="leasing-analytics-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Income &amp; Lease Profile</div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            WALT, reversion, and tenant concentration
          </h3>
        </div>
        {a.diversificationLabel ? (
          <Badge tone={diversificationTone(a.diversificationLabel)}>
            {a.diversificationLabel}
            {a.herfindahlIndex != null ? ` · HHI ${formatNumber(a.herfindahlIndex, 2)}` : ''}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[12px] border border-border bg-[hsl(var(--panel-alt))] p-4"
          >
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{kpi.label}</dt>
            <dd className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
              {kpi.value}
            </dd>
            {kpi.hint ? <dd className="mt-0.5 text-xs text-muted">{kpi.hint}</dd> : null}
          </div>
        ))}
      </dl>

      <div className="mt-6 overflow-x-auto rounded-[12px] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[hsl(var(--panel-alt))] text-left">
              {['Tenant', 'Annual Income', '% of Income', 'Leased kW', 'Expiry'].map((head, i) => (
                <th
                  key={head}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted ${
                    i === 0 ? '' : 'text-right'
                  }`}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.rows.slice(0, 12).map((row) => (
              <tr key={row.tenantName} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.tenantName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {money(row.annualIncomeKrw)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                  {formatPercent(row.incomeSharePct)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                  {formatNumber(row.leasedKw, 0)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                  {row.expiryYear != null ? `Y${row.expiryYear}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        WALT is the contracted weighted-average lease term; rollover is income expiring within{' '}
        {a.nearTermYears} years of the earliest expiry. Reversion compares the capacity-weighted
        in-place rent to the modeled mark-to-market rate.
      </p>
    </Card>
  );
}
