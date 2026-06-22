import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  convertFromKrwAtRate,
  formatCurrencyFromKrwAtRate,
  type SupportedCurrency
} from '@/lib/finance/currency';
import { formatNumber, formatPercent, toSentenceCase } from '@/lib/utils';
import { buildDebtBreakdown } from '@/lib/services/valuation/debt-breakdown';
import { resolveAssumptionNumber } from '@/lib/services/valuation/assumption-access';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type Props = {
  assumptions?: Record<string, number | string | null> | null;
  provenance?: ProvenanceEntry[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
  debtFacilities?: Array<{
    facilityType: string;
    lenderName?: string | null;
    commitmentKrw: number;
    drawnAmountKrw?: number | null;
    interestRatePct: number;
    gracePeriodMonths?: number | null;
    amortizationTermMonths?: number | null;
    amortizationProfile: string;
    balloonPct?: number | null;
    reserveMonths?: number | null;
    draws: Array<{
      amountKrw: number;
    }>;
  }>;
  scenarios?: Array<{
    name: string;
    debtServiceCoverage?: number | null;
  }>;
  /** Concluded/base-case value (run.baseCaseValueKrw) — the reconciled number. */
  concludedValueKrw?: number | null;
};

type Metric = {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn';
};

function pickNumber(assumptions: Props['assumptions'], key: string) {
  const value = assumptions?.[key];
  return typeof value === 'number' ? value : null;
}

/**
 * Resolve an approach value. The data-center engine nests the per-approach
 * values under `assumptions.approaches.{replacementFloor,incomeApproach,
 * leaseDcf,comparables}`; older/other strategies wrote flat top-level keys.
 * Prefer the nested value, fall back to the legacy flat key.
 */
function pickApproach(assumptions: Props['assumptions'], nestedKey: string, flatKey: string) {
  const approaches = (assumptions as Record<string, unknown> | null | undefined)?.approaches as
    | Record<string, unknown>
    | undefined;
  const nested = approaches?.[nestedKey];
  if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  return pickNumber(assumptions, flatKey);
}

function buildValueStack(
  assumptions: Props['assumptions'],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null,
  concludedValueKrw?: number | null
): Metric[] {
  const money = (value: number | null) =>
    formatCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw);
  const comparables = pickApproach(assumptions, 'comparables', 'directComparableValueKrw');
  const concluded =
    typeof concludedValueKrw === 'number' && Number.isFinite(concludedValueKrw)
      ? concludedValueKrw
      : pickNumber(assumptions, 'weightedValueKrw');

  const rows: Metric[] = [
    {
      label: 'Replacement Floor',
      value: money(pickApproach(assumptions, 'replacementFloor', 'replacementCostFloorKrw'))
    },
    {
      label: 'Income Approach',
      value: money(pickApproach(assumptions, 'incomeApproach', 'incomeApproachValueKrw'))
    },
    { label: 'DCF Value', value: money(pickApproach(assumptions, 'leaseDcf', 'dcfValueKrw')) }
  ];
  if (comparables != null) {
    rows.push({ label: 'Comparables', value: money(comparables) });
  }
  rows.push({ label: 'Concluded Value', value: money(concluded), tone: 'good' });
  return rows;
}

function buildOperatingInputs(
  assumptions: Props['assumptions'],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
): Metric[] {
  // Resolve nested-or-flat: the data-center engine nests these under
  // assumptions.metrics.*, stabilized-income strategies write them flat.
  const capacity = resolveAssumptionNumber(assumptions, 'capacityMw');
  const monthlyRate = resolveAssumptionNumber(assumptions, 'monthlyRatePerKwKrw');
  const powerTariff = resolveAssumptionNumber(assumptions, 'powerPriceKrwPerKwh');

  return [
    {
      label: 'Capacity',
      value: capacity !== null ? `${formatNumber(capacity, 1)} MW` : 'N/A'
    },
    {
      label: 'Occupancy',
      value: formatPercent(resolveAssumptionNumber(assumptions, 'occupancyPct'))
    },
    {
      label: 'Monthly Rate / kW',
      value:
        monthlyRate !== null
          ? `${formatCurrencyFromKrwAtRate(monthlyRate, displayCurrency, fxRateToKrw)} / kW·mo`
          : 'N/A'
    },
    {
      label: 'Power Tariff',
      value:
        powerTariff !== null
          ? `${formatNumber(convertFromKrwAtRate(powerTariff, displayCurrency, fxRateToKrw) ?? null, 2)} ${displayCurrency}/kWh`
          : 'N/A'
    },
    {
      label: 'PUE Target',
      value: formatNumber(resolveAssumptionNumber(assumptions, 'pueTarget'), 2)
    },
    {
      label: 'Cap Rate',
      value: formatPercent(resolveAssumptionNumber(assumptions, 'capRatePct'), 2)
    },
    {
      label: 'Discount Rate',
      value: formatPercent(resolveAssumptionNumber(assumptions, 'discountRatePct'), 2)
    },
    {
      label: 'Debt Cost',
      value: formatPercent(resolveAssumptionNumber(assumptions, 'debtCostPct'), 2)
    }
  ];
}

function countModes(provenance: ProvenanceEntry[]) {
  return provenance.reduce(
    (acc, entry) => {
      const mode = entry.mode.toLowerCase();
      if (mode === 'api') acc.api += 1;
      else if (mode === 'manual') acc.manual += 1;
      else acc.fallback += 1;
      return acc;
    },
    { api: 0, manual: 0, fallback: 0 }
  );
}

function sourceMix(provenance: ProvenanceEntry[]): Metric[] {
  const counts = countModes(provenance);
  const total = provenance.length || 1;

  return [
    {
      label: 'API-backed fields',
      value: `${counts.api}/${total}`,
      tone: counts.api > 0 ? 'good' : 'default'
    },
    {
      label: 'Manual fields',
      value: `${counts.manual}/${total}`
    },
    {
      label: 'Fallback fields',
      value: `${counts.fallback}/${total}`,
      tone: counts.fallback > 0 ? 'warn' : 'default'
    }
  ];
}

function MetricList({ title, metrics }: { title: string; metrics: Metric[] }) {
  return (
    <Card className="space-y-4">
      <div className="eyebrow">{title}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-4"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
              {metric.label}
            </div>
            <div
              className={`mt-2 text-lg font-semibold ${
                metric.tone === 'good'
                  ? 'text-[hsl(var(--success))]'
                  : metric.tone === 'warn'
                    ? 'text-[hsl(var(--warning))]'
                    : 'text-[hsl(var(--foreground))]'
              }`}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ValuationBreakdown({
  assumptions,
  provenance = [],
  displayCurrency = 'KRW',
  fxRateToKrw,
  debtFacilities = [],
  scenarios = [],
  concludedValueKrw
}: Props) {
  const valueStack = buildValueStack(assumptions, displayCurrency, fxRateToKrw, concludedValueKrw);
  const operatingInputs = buildOperatingInputs(assumptions, displayCurrency, fxRateToKrw);
  const sourceSummary = sourceMix(provenance);
  const debtBreakdown = buildDebtBreakdown(assumptions, debtFacilities, scenarios);
  const tailMetrics = provenance.slice(0, 3).map((entry) => ({
    label: toSentenceCase(entry.field),
    value: `${entry.mode} / ${entry.freshnessLabel}`
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
        <MetricList title="Value Stack" metrics={valueStack} />
        <MetricList title="Operating Inputs" metrics={operatingInputs} />
        <MetricList title="Source Mix" metrics={[...sourceSummary, ...tailMetrics]} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Debt Stack Impact</div>
          <div className="flex flex-wrap gap-2">
            <Badge>{formatNumber(debtBreakdown.facilities.length, 0)} facilities</Badge>
            <Badge
              tone={
                debtBreakdown.baseDscr !== null && debtBreakdown.baseDscr >= 1.2 ? 'good' : 'warn'
              }
            >
              Base DSCR{' '}
              {debtBreakdown.baseDscr !== null
                ? `${formatNumber(debtBreakdown.baseDscr, 2)}x`
                : 'N/A'}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            [
              'Total Commitment',
              formatCurrencyFromKrwAtRate(
                debtBreakdown.totalCommitmentKrw,
                displayCurrency,
                fxRateToKrw
              )
            ],
            [
              'Drawn / Scheduled',
              formatCurrencyFromKrwAtRate(
                debtBreakdown.totalDrawnAmountKrw,
                displayCurrency,
                fxRateToKrw
              )
            ],
            ['Weighted Rate', formatPercent(debtBreakdown.weightedInterestRatePct, 2)],
            [
              'Reserve Requirement',
              formatCurrencyFromKrwAtRate(
                debtBreakdown.reserveRequirementKrw,
                displayCurrency,
                fxRateToKrw
              )
            ],
            [
              'Ending Balance',
              formatCurrencyFromKrwAtRate(
                debtBreakdown.endingDebtBalanceKrw,
                displayCurrency,
                fxRateToKrw
              )
            ]
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-4"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                {label}
              </div>
              <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                {value}
              </div>
            </div>
          ))}
        </div>

        {debtBreakdown.facilities.length > 0 ? (
          <div className="mt-4 space-y-3">
            {debtBreakdown.facilities.map((facility) => (
              <div
                key={`${facility.label}-${facility.facilityTypeLabel}`}
                className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {facility.label}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      {facility.facilityTypeLabel} / {facility.amortizationLabel}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{formatPercent(facility.commitmentSharePct, 1)} share</Badge>
                    {facility.watchpoint ? <Badge tone="warn">{facility.watchpoint}</Badge> : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      Commitment
                    </div>
                    <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                      {formatCurrencyFromKrwAtRate(
                        facility.commitmentKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      Drawn / Scheduled
                    </div>
                    <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                      {formatCurrencyFromKrwAtRate(
                        facility.drawnAmountKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      Rate Contribution
                    </div>
                    <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                      {formatPercent(facility.rateContributionPct, 2)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      Reserve Load
                    </div>
                    <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                      {formatCurrencyFromKrwAtRate(
                        facility.reserveContributionKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-[hsl(var(--panel-alt))] p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      Ending Balance Proxy
                    </div>
                    <div className="mt-2 text-sm text-[hsl(var(--foreground))]">
                      {formatCurrencyFromKrwAtRate(
                        facility.endingBalanceContributionKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted))]">
                      {facility.drawCount} draws in schedule
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4 text-sm text-[hsl(var(--foreground-muted))]">
            No stored debt facilities yet. The current valuation is likely leaning on the synthetic
            underwriting facility.
          </div>
        )}
      </Card>
    </div>
  );
}
