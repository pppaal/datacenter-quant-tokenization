import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import type { ProFormaYear } from '@/lib/services/valuation/types';
import { formatNumber } from '@/lib/utils';

type StatementRow = {
  label: string;
  key: string;
  tone?: 'default' | 'subtotal' | 'emphasis';
  displayAsNegative?: boolean;
  value: (year: ProFormaYear) => number | null;
};

type StatementHighlight = {
  label: string;
  value: string;
};

type StatementSection = {
  title: string;
  subtitle: string;
  rows: StatementRow[];
  highlights: StatementHighlight[];
};

type RolloverHighlight = {
  label: string;
  value: string;
};

function formatStatementCurrency(
  value: number,
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null,
  options?: {
    displayAsNegative?: boolean;
  }
) {
  const shouldWrapNegative = value < 0 || options?.displayAsNegative;
  const formatted = formatCurrencyFromKrwAtRate(Math.abs(value), displayCurrency, fxRateToKrw);
  return shouldWrapNegative ? `(${formatted})` : formatted;
}

function formatStatementMetric(
  value: number | null,
  format: 'currency' | 'percent' | 'ratio' | 'number',
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
) {
  if (value === null) return 'N/A';
  if (format === 'currency') return formatStatementCurrency(value, displayCurrency, fxRateToKrw);
  if (format === 'percent') return `${formatNumber(value, 1)}%`;
  if (format === 'ratio') return `${formatNumber(value, 2)}x`;
  return formatNumber(value, 0);
}

function buildSectionHighlights(
  section: StatementSection,
  years: ProFormaYear[],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
): StatementHighlight[] {
  const firstYear = years[0];
  const stabilizedYear = years.at(-1);

  if (!firstYear || !stabilizedYear) {
    return [];
  }

  if (section.title === 'Revenue') {
    const recoverySharePct =
      firstYear.totalOperatingRevenueKrw > 0
        ? (firstYear.reimbursementRevenueKrw / firstYear.totalOperatingRevenueKrw) * 100
        : 0;
    const maxRenewalRatePerKwKrw = years.reduce<number | null>(
      (max, year) =>
        year.weightedRenewalRatePerKwKrw !== null
          ? max === null
            ? year.weightedRenewalRatePerKwKrw
            : Math.max(max, year.weightedRenewalRatePerKwKrw)
          : max,
      null
    );

    return [
      {
        label: 'Year 1 Op. Revenue',
        value: formatStatementMetric(firstYear.totalOperatingRevenueKrw, 'currency', displayCurrency, fxRateToKrw)
      },
      {
        label: 'Stabilized Op. Revenue',
        value: formatStatementMetric(
          stabilizedYear.totalOperatingRevenueKrw,
          'currency',
          displayCurrency,
          fxRateToKrw
        )
      },
      {
        label: 'Recoveries Share',
        value: formatStatementMetric(recoverySharePct, 'percent', displayCurrency, fxRateToKrw)
      },
      {
        label: 'Peak MTM Rate',
        value:
          maxRenewalRatePerKwKrw !== null
            ? `${formatStatementCurrency(maxRenewalRatePerKwKrw, displayCurrency, fxRateToKrw)} / kW`
            : 'N/A'
      }
    ];
  }

  if (section.title === 'Operating Costs') {
    const noiMarginPct =
      firstYear.totalOperatingRevenueKrw > 0 ? (firstYear.noiKrw / firstYear.totalOperatingRevenueKrw) * 100 : 0;

    return [
      {
        label: 'Year 1 NOI',
        value: formatStatementMetric(firstYear.noiKrw, 'currency', displayCurrency, fxRateToKrw)
      },
      {
        label: 'NOI Margin',
        value: formatStatementMetric(noiMarginPct, 'percent', displayCurrency, fxRateToKrw)
      },
      {
        label: 'Year 1 CFADS',
        value: formatStatementMetric(firstYear.cfadsBeforeDebtKrw, 'currency', displayCurrency, fxRateToKrw)
      }
    ];
  }

  return [
    {
      label: 'Year 1 Debt Service',
      value: formatStatementMetric(firstYear.debtServiceKrw, 'currency', displayCurrency, fxRateToKrw)
    },
    {
      label: 'Year 1 DSCR',
      value: formatStatementMetric(firstYear.dscr, 'ratio', displayCurrency, fxRateToKrw)
    },
    {
      label: 'Ending Debt',
      value: formatStatementMetric(stabilizedYear.endingDebtBalanceKrw, 'currency', displayCurrency, fxRateToKrw)
    }
  ];
}

function buildRolloverHighlights(
  years: ProFormaYear[],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
): RolloverHighlight[] {
  const renewalYears = years.filter((year) => year.activeRenewalLeaseCount > 0);
  if (renewalYears.length === 0) return [];

  const firstRenewalYear = renewalYears[0];
  const lastRenewalYear = renewalYears[renewalYears.length - 1];
  const peakRenewalRatePerKwKrw = renewalYears.reduce<number | null>(
    (max, year) =>
      year.weightedRenewalRatePerKwKrw !== null
        ? max === null
          ? year.weightedRenewalRatePerKwKrw
          : Math.max(max, year.weightedRenewalRatePerKwKrw)
        : max,
    null
  );

  return [
    {
      label: 'First Renewal Year',
      value: `Year ${firstRenewalYear.year}`
    },
    {
      label: 'Last Renewal Year',
      value: `Year ${lastRenewalYear.year}`
    },
    {
      label: 'Peak Active Renewals',
      value: formatNumber(
        renewalYears.reduce((max, year) => Math.max(max, year.activeRenewalLeaseCount), 0),
        0
      )
    },
    {
      label: 'Peak MTM Rate',
      value:
        peakRenewalRatePerKwKrw !== null
          ? `${formatStatementCurrency(peakRenewalRatePerKwKrw, displayCurrency, fxRateToKrw)} / kW`
          : 'N/A'
    }
  ];
}

function StatementTable({
  section,
  years,
  rolloverBasePath,
  selectedRolloverYear,
  displayCurrency,
  fxRateToKrw
}: {
  section: StatementSection;
  years: ProFormaYear[];
  rolloverBasePath?: string;
  selectedRolloverYear?: number | null;
  displayCurrency: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const drilldownRowKeys = new Set([
    'renewalRevenueKrw',
    'renewalDowntimeLossKrw',
    'renewalRentFreeLossKrw',
    'renewalTenantCapitalCostKrw'
  ]);

  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{section.title}</div>
          <div className="mt-1 text-sm text-slate-400">{section.subtitle}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {section.highlights.map((highlight) => (
            <div
              key={`${section.title}-${highlight.label}`}
              className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{highlight.label}</div>
              <div className="mt-1 text-sm font-medium text-white">{highlight.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="sticky left-0 z-20 min-w-[240px] bg-slate-950/95 px-3 py-2 backdrop-blur">
                Line Item
              </th>
              {years.map((year) => {
                const hasRenewalWindow = year.activeRenewalLeaseCount > 0 && rolloverBasePath;
                const isActive = selectedRolloverYear === year.year;
                return (
                <th key={year.year} className="min-w-[140px] px-3 py-2 text-right">
                  {hasRenewalWindow ? (
                    <Link
                      href={`${rolloverBasePath}?rolloverYear=${year.year}#lease-rollover-drilldown`}
                      className={`inline-flex rounded-full border px-3 py-1 transition ${
                        isActive
                          ? 'border-amber-300/40 bg-amber-200/15 text-white'
                          : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-amber-300/30 hover:text-white'
                      }`}
                    >
                      Year {year.year}
                    </Link>
                  ) : (
                    `Year ${year.year}`
                  )}
                </th>
              )})}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => {
              const toneClass =
                row.tone === 'emphasis'
                  ? 'border-white/20 bg-white/[0.08] font-semibold text-white'
                  : row.tone === 'subtotal'
                    ? 'border-white/15 bg-white/[0.05] font-medium text-slate-100'
                    : 'border-white/10 bg-white/[0.02] text-slate-200';

              return (
                <tr key={`${section.title}-${row.key}`} className={`rounded-2xl border ${toneClass}`}>
                  <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-3 backdrop-blur">{row.label}</td>
                  {years.map((year) => {
                    const value = row.value(year);
                    const valueClass =
                      row.displayAsNegative && value !== null && value > 0 ? 'text-rose-200' : 'text-inherit';
                    const shouldLinkToDrilldown =
                      Boolean(rolloverBasePath) &&
                      year.activeRenewalLeaseCount > 0 &&
                      drilldownRowKeys.has(row.key);
                    const formattedValue =
                      value === null
                        ? 'N/A'
                        : formatStatementCurrency(value, displayCurrency, fxRateToKrw, {
                            displayAsNegative: row.displayAsNegative
                          });

                    return (
                      <td key={`${row.key}-${year.year}`} className={`px-3 py-3 text-right ${valueClass}`}>
                        {shouldLinkToDrilldown && value !== null ? (
                          <Link
                            href={`${rolloverBasePath}?rolloverYear=${year.year}#lease-rollover-drilldown`}
                            className="inline-flex rounded-full border border-amber-400/15 bg-amber-500/[0.06] px-3 py-1 text-amber-50/85 transition hover:border-amber-300/30 hover:text-white"
                          >
                            {formattedValue}
                          </Link>
                        ) : (
                          formattedValue
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildStatementSections(): StatementSection[] {
  return [
    {
      title: 'Revenue',
      subtitle: 'Potential rent, lease-up, vacancy leakage, and recoveries.',
      highlights: [],
      rows: [
        {
          key: 'grossPotentialRevenueKrw',
          label: 'Gross Potential Revenue',
          value: (year) => year.grossPotentialRevenueKrw
        },
        {
          key: 'contractedRevenueKrw',
          label: 'Contracted Revenue',
          value: (year) => year.contractedRevenueKrw
        },
        {
          key: 'renewalRevenueKrw',
          label: 'Renewal Revenue',
          value: (year) => year.renewalRevenueKrw
        },
        {
          key: 'residualRevenueKrw',
          label: 'Residual Revenue',
          value: (year) => year.residualRevenueKrw
        },
        {
          key: 'downtimeLossKrw',
          label: 'Downtime Loss',
          displayAsNegative: true,
          value: (year) => year.downtimeLossKrw
        },
        {
          key: 'renewalDowntimeLossKrw',
          label: 'Renewal Downtime Loss',
          displayAsNegative: true,
          value: (year) => year.renewalDowntimeLossKrw
        },
        {
          key: 'rentFreeLossKrw',
          label: 'Rent-Free Loss',
          displayAsNegative: true,
          value: (year) => year.rentFreeLossKrw
        },
        {
          key: 'renewalRentFreeLossKrw',
          label: 'Renewal Rent-Free Loss',
          displayAsNegative: true,
          value: (year) => year.renewalRentFreeLossKrw
        },
        {
          key: 'revenueKrw',
          label: 'Net Rental Revenue',
          tone: 'subtotal',
          value: (year) => year.revenueKrw
        },
        {
          key: 'fixedRecoveriesKrw',
          label: 'Fixed Recoveries',
          value: (year) => year.fixedRecoveriesKrw
        },
        {
          key: 'siteRecoveriesKrw',
          label: 'OpEx Recoveries',
          value: (year) => year.siteRecoveriesKrw
        },
        {
          key: 'utilityPassThroughRevenueKrw',
          label: 'Utility Pass-Through',
          value: (year) => year.utilityPassThroughRevenueKrw
        },
        {
          key: 'reimbursementRevenueKrw',
          label: 'Total Recoveries',
          tone: 'subtotal',
          value: (year) => year.reimbursementRevenueKrw
        },
        {
          key: 'totalOperatingRevenueKrw',
          label: 'Total Operating Revenue',
          tone: 'emphasis',
          value: (year) => year.totalOperatingRevenueKrw
        }
      ]
    },
    {
      title: 'Operating Costs',
      subtitle: 'Site-level operating burden, capitalized leasing costs, and NOI bridge.',
      highlights: [],
      rows: [
        {
          key: 'powerCostKrw',
          label: 'Power Cost',
          displayAsNegative: true,
          value: (year) => year.powerCostKrw
        },
        {
          key: 'siteOperatingExpenseKrw',
          label: 'Site Operating Expense',
          displayAsNegative: true,
          value: (year) => year.siteOperatingExpenseKrw
        },
        {
          key: 'operatingExpenseKrw',
          label: 'Gross Operating Expense',
          tone: 'subtotal',
          displayAsNegative: true,
          value: (year) => year.operatingExpenseKrw
        },
        {
          key: 'nonRecoverableOperatingExpenseKrw',
          label: 'Non-Recoverable OpEx',
          displayAsNegative: true,
          value: (year) => year.nonRecoverableOperatingExpenseKrw
        },
        {
          key: 'maintenanceReserveKrw',
          label: 'Maintenance Reserve',
          displayAsNegative: true,
          value: (year) => year.maintenanceReserveKrw
        },
        {
          key: 'tenantImprovementKrw',
          label: 'Tenant Improvement',
          displayAsNegative: true,
          value: (year) => year.tenantImprovementKrw
        },
        {
          key: 'leasingCommissionKrw',
          label: 'Leasing Commission',
          displayAsNegative: true,
          value: (year) => year.leasingCommissionKrw
        },
        {
          key: 'tenantCapitalCostKrw',
          label: 'TI / LC Total',
          tone: 'subtotal',
          displayAsNegative: true,
          value: (year) => year.tenantCapitalCostKrw
        },
        {
          key: 'renewalTenantCapitalCostKrw',
          label: 'Renewal TI / LC',
          displayAsNegative: true,
          value: (year) => year.renewalTenantCapitalCostKrw
        },
        {
          key: 'fitOutCostKrw',
          label: 'Legacy Fit-Out Proxy',
          displayAsNegative: true,
          value: (year) => year.fitOutCostKrw
        },
        {
          key: 'noiKrw',
          label: 'NOI',
          tone: 'emphasis',
          value: (year) => year.noiKrw
        },
        {
          key: 'cfadsBeforeDebtKrw',
          label: 'CFADS Before Debt',
          tone: 'emphasis',
          value: (year) => year.cfadsBeforeDebtKrw
        }
      ]
    },
    {
      title: 'Financing And Equity',
      subtitle: 'Debt movement, below-NOI charges, taxes, and equity cash flow.',
      highlights: [],
      rows: [
        {
          key: 'drawAmountKrw',
          label: 'Debt Draw',
          value: (year) => year.drawAmountKrw
        },
        {
          key: 'interestKrw',
          label: 'Interest',
          displayAsNegative: true,
          value: (year) => year.interestKrw
        },
        {
          key: 'principalKrw',
          label: 'Principal',
          displayAsNegative: true,
          value: (year) => year.principalKrw
        },
        {
          key: 'debtServiceKrw',
          label: 'Debt Service',
          tone: 'subtotal',
          displayAsNegative: true,
          value: (year) => year.debtServiceKrw
        },
        {
          key: 'propertyTaxKrw',
          label: 'Property Tax',
          displayAsNegative: true,
          value: (year) => year.propertyTaxKrw
        },
        {
          key: 'insuranceKrw',
          label: 'Insurance',
          displayAsNegative: true,
          value: (year) => year.insuranceKrw
        },
        {
          key: 'managementFeeKrw',
          label: 'Management Fee',
          displayAsNegative: true,
          value: (year) => year.managementFeeKrw
        },
        {
          key: 'reserveContributionKrw',
          label: 'Reserve Contribution',
          displayAsNegative: true,
          value: (year) => year.reserveContributionKrw
        },
        {
          key: 'corporateTaxKrw',
          label: 'Corporate Tax',
          displayAsNegative: true,
          value: (year) => year.corporateTaxKrw
        },
        {
          key: 'afterTaxDistributionKrw',
          label: 'After-Tax Equity Cash Flow',
          tone: 'emphasis',
          value: (year) => year.afterTaxDistributionKrw
        },
        {
          key: 'endingDebtBalanceKrw',
          label: 'Ending Debt Balance',
          tone: 'subtotal',
          value: (year) => year.endingDebtBalanceKrw
        }
      ]
    }
  ];
}

export function ProFormaPanel({
  assumptions,
  rolloverBasePath,
  selectedRolloverYear,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  assumptions: unknown;
  rolloverBasePath?: string;
  selectedRolloverYear?: number | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const proForma = readStoredBaseCaseProForma(assumptions);

  if (!proForma) {
    return (
      <Card>
        <div className="eyebrow">Base Case Pro Forma</div>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          No stored base-case pro forma yet. Run a fresh valuation after the new cash-flow model is saved.
        </div>
      </Card>
    );
  }

  const summaryCards: [string, number, 'currency' | 'year' | 'percent' | 'multiple'][] = [
    ['Year 1 Revenue', proForma.summary.annualRevenueKrw, 'currency'],
    ['Stabilized NOI', proForma.summary.stabilizedNoiKrw, 'currency'],
    ['Terminal Exit Year', proForma.summary.terminalYear, 'year'],
    ['Net Exit Proceeds', proForma.summary.netExitProceedsKrw, 'currency'],
    ['Levered Equity Value', proForma.summary.leveredEquityValueKrw, 'currency'],
    ['Ending Debt Balance', proForma.summary.endingDebtBalanceKrw, 'currency']
  ];

  const hasReturnMetrics = proForma.summary.equityIrr !== undefined;
  const returnCards: [string, string, 'good' | 'warn' | 'neutral'][] = hasReturnMetrics
    ? [
        [
          'Equity IRR',
          proForma.summary.equityIrr !== null ? `${formatNumber(proForma.summary.equityIrr, 2)}%` : 'N/A',
          proForma.summary.equityIrr !== null && proForma.summary.equityIrr >= 15 ? 'good' : proForma.summary.equityIrr !== null && proForma.summary.equityIrr >= 8 ? 'neutral' : 'warn'
        ],
        [
          'Unlevered IRR',
          proForma.summary.unleveragedIrr !== null ? `${formatNumber(proForma.summary.unleveragedIrr, 2)}%` : 'N/A',
          proForma.summary.unleveragedIrr !== null && proForma.summary.unleveragedIrr >= 10 ? 'good' : 'neutral'
        ],
        [
          'Equity Multiple',
          `${formatNumber(proForma.summary.equityMultiple, 2)}x`,
          proForma.summary.equityMultiple >= 2.0 ? 'good' : proForma.summary.equityMultiple >= 1.5 ? 'neutral' : 'warn'
        ],
        [
          'Avg Cash-on-Cash',
          `${formatNumber(proForma.summary.averageCashOnCash, 2)}%`,
          proForma.summary.averageCashOnCash >= 8 ? 'good' : proForma.summary.averageCashOnCash >= 5 ? 'neutral' : 'warn'
        ],
        [
          'Payback',
          proForma.summary.paybackYear !== null ? `Year ${proForma.summary.paybackYear}` : 'Beyond horizon',
          proForma.summary.paybackYear !== null && proForma.summary.paybackYear <= 7 ? 'good' : 'warn'
        ],
        [
          'Initial Equity',
          formatCurrencyFromKrwAtRate(proForma.summary.initialEquityKrw, displayCurrency, fxRateToKrw),
          'neutral'
        ]
      ]
    : [];

  const firstYear = proForma.years[0];
  const rolloverHighlights = buildRolloverHighlights(proForma.years, displayCurrency, fxRateToKrw);
  const renewalYears = proForma.years.filter((year) => year.activeRenewalLeaseCount > 0).map((year) => year.year);
  const sections = buildStatementSections().map((section) => ({
    ...section,
    highlights: buildSectionHighlights(section, proForma.years, displayCurrency, fxRateToKrw)
  }));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Base Case Pro Forma</div>
          <div className="mt-2 text-sm text-slate-400">
            Revenue, operating costs, financing, and equity cash flow laid out as a statement.
          </div>
        </div>
        <div className="text-sm text-slate-400">{formatNumber(proForma.years.length, 0)} forecast years</div>
      </div>

      {returnCards.length > 0 ? (
        <div className="mt-4 rounded-[26px] border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Return Metrics</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {returnCards.map(([label, value, tone]) => (
              <div key={label} className={`rounded-2xl border p-4 ${
                tone === 'good' ? 'border-emerald-400/20 bg-emerald-500/[0.06]'
                  : tone === 'warn' ? 'border-orange-400/20 bg-orange-500/[0.06]'
                    : 'border-white/10 bg-slate-950/40'
              }`}>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
                <div className="mt-2 text-lg font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map(([label, value, fmt]) => (
          <div key={label} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {fmt === 'year'
                ? `Year ${formatNumber(value, 0)}`
                : fmt === 'percent'
                  ? `${formatNumber(value, 2)}%`
                  : fmt === 'multiple'
                    ? `${formatNumber(value, 2)}x`
                    : formatCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw)}
            </div>
          </div>
        ))}
      </div>

      {rolloverHighlights.length > 0 ? (
        <div className="mt-4 rounded-[26px] border border-amber-500/20 bg-amber-500/[0.06] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Rollover Watch</div>
          <div className="mt-2 text-sm text-amber-50/80">
            Renewal-driven years, mark-to-market rollover pricing, and repeat-cycle exposure.
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {rolloverHighlights.map((highlight) => (
              <div key={highlight.label} className="rounded-2xl border border-amber-400/15 bg-slate-950/35 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-100/60">{highlight.label}</div>
                <div className="mt-2 text-lg font-semibold text-white">{highlight.value}</div>
              </div>
            ))}
          </div>
          {rolloverBasePath && renewalYears.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-100/60">Jump To Monthly Window</div>
              {renewalYears.map((year) => {
                const isActive = selectedRolloverYear === year;
                return (
                  <Link
                    key={year}
                    href={`${rolloverBasePath}?rolloverYear=${year}#lease-rollover-drilldown`}
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] transition ${
                      isActive
                        ? 'border-amber-300/40 bg-amber-200/15 text-white'
                        : 'border-amber-400/15 bg-slate-950/35 text-amber-50/75 hover:border-amber-300/30 hover:text-white'
                    }`}
                  >
                    Year {year}
                  </Link>
                );
              })}
              <Link
                href={`${rolloverBasePath}#lease-rollover-drilldown`}
                className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                All
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {firstYear ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Year 1 DSCR</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {firstYear.dscr !== null ? `${formatNumber(firstYear.dscr, 2)}x` : 'N/A'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Year 1 Occupied Load</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(firstYear.occupiedKw, 0)} kW</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Year 1 Total Op. Revenue</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formatCurrencyFromKrwAtRate(firstYear.totalOperatingRevenueKrw, displayCurrency, fxRateToKrw)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {sections.map((section) => (
          <StatementTable
            key={section.title}
            section={section}
            years={proForma.years}
            rolloverBasePath={rolloverBasePath}
            selectedRolloverYear={selectedRolloverYear}
            displayCurrency={displayCurrency}
            fxRateToKrw={fxRateToKrw}
          />
        ))}
      </div>
    </Card>
  );
}
