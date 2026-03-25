import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { convertFromKrwAtRate, formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent, toSentenceCase } from '@/lib/utils';
import { buildDebtBreakdown } from '@/lib/valuation/debt-breakdown';

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

function buildValueStack(
  assumptions: Props['assumptions'],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
): Metric[] {
  return [
    {
      label: 'Replacement Floor',
      value: formatCurrencyFromKrwAtRate(pickNumber(assumptions, 'replacementCostFloorKrw'), displayCurrency, fxRateToKrw)
    },
    {
      label: 'Income Approach',
      value: formatCurrencyFromKrwAtRate(pickNumber(assumptions, 'incomeApproachValueKrw'), displayCurrency, fxRateToKrw)
    },
    {
      label: 'DCF Value',
      value: formatCurrencyFromKrwAtRate(pickNumber(assumptions, 'dcfValueKrw'), displayCurrency, fxRateToKrw)
    },
    {
      label: 'Weighted Value',
      value: formatCurrencyFromKrwAtRate(pickNumber(assumptions, 'weightedValueKrw'), displayCurrency, fxRateToKrw),
      tone: 'good'
    }
  ];
}

function buildOperatingInputs(
  assumptions: Props['assumptions'],
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
): Metric[] {
  const monthlyRate = pickNumber(assumptions, 'monthlyRatePerKwKrw');
  const powerTariff = pickNumber(assumptions, 'powerPriceKrwPerKwh');

  return [
    {
      label: 'Capacity',
      value:
        assumptions?.capacityMw !== undefined && assumptions?.capacityMw !== null
          ? `${formatNumber(pickNumber(assumptions, 'capacityMw'), 1)} MW`
          : 'N/A'
    },
    {
      label: 'Occupancy',
      value: formatPercent(pickNumber(assumptions, 'occupancyPct'))
    },
    {
      label: 'Monthly Rate / kW',
      value: monthlyRate !== null ? `${formatCurrencyFromKrwAtRate(monthlyRate, displayCurrency, fxRateToKrw)} / kW` : 'N/A'
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
      value: formatNumber(pickNumber(assumptions, 'pueTarget'), 2)
    },
    {
      label: 'Cap Rate',
      value: formatPercent(pickNumber(assumptions, 'capRatePct'), 2)
    },
    {
      label: 'Discount Rate',
      value: formatPercent(pickNumber(assumptions, 'discountRatePct'), 2)
    },
    {
      label: 'Debt Cost',
      value: formatPercent(pickNumber(assumptions, 'debtCostPct'), 2)
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
          <div key={metric.label} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
            <div
              className={`mt-2 text-lg font-semibold ${
                metric.tone === 'good'
                  ? 'text-emerald-300'
                  : metric.tone === 'warn'
                    ? 'text-amber-300'
                    : 'text-white'
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
  scenarios = []
}: Props) {
  const valueStack = buildValueStack(assumptions, displayCurrency, fxRateToKrw);
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
            <Badge tone={debtBreakdown.baseDscr !== null && debtBreakdown.baseDscr >= 1.2 ? 'good' : 'warn'}>
              Base DSCR {debtBreakdown.baseDscr !== null ? `${formatNumber(debtBreakdown.baseDscr, 2)}x` : 'N/A'}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total Commitment', formatCurrencyFromKrwAtRate(debtBreakdown.totalCommitmentKrw, displayCurrency, fxRateToKrw)],
            ['Drawn / Scheduled', formatCurrencyFromKrwAtRate(debtBreakdown.totalDrawnAmountKrw, displayCurrency, fxRateToKrw)],
            ['Weighted Rate', formatPercent(debtBreakdown.weightedInterestRatePct, 2)],
            ['Reserve Requirement', formatCurrencyFromKrwAtRate(debtBreakdown.reserveRequirementKrw, displayCurrency, fxRateToKrw)],
            ['Ending Balance', formatCurrencyFromKrwAtRate(debtBreakdown.endingDebtBalanceKrw, displayCurrency, fxRateToKrw)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-slate-950/40 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
              <div className="mt-2 text-lg font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        {debtBreakdown.facilities.length > 0 ? (
          <div className="mt-4 space-y-3">
            {debtBreakdown.facilities.map((facility) => (
              <div key={`${facility.label}-${facility.facilityTypeLabel}`} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{facility.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {facility.facilityTypeLabel} / {facility.amortizationLabel}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{formatPercent(facility.commitmentSharePct, 1)} share</Badge>
                    {facility.watchpoint ? <Badge tone="warn">{facility.watchpoint}</Badge> : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Commitment</div>
                    <div className="mt-2 text-sm text-white">
                      {formatCurrencyFromKrwAtRate(facility.commitmentKrw, displayCurrency, fxRateToKrw)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Drawn / Scheduled</div>
                    <div className="mt-2 text-sm text-white">
                      {formatCurrencyFromKrwAtRate(facility.drawnAmountKrw, displayCurrency, fxRateToKrw)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Rate Contribution</div>
                    <div className="mt-2 text-sm text-white">{formatPercent(facility.rateContributionPct, 2)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Reserve Load</div>
                    <div className="mt-2 text-sm text-white">
                      {formatCurrencyFromKrwAtRate(facility.reserveContributionKrw, displayCurrency, fxRateToKrw)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Ending Balance Proxy</div>
                    <div className="mt-2 text-sm text-white">
                      {formatCurrencyFromKrwAtRate(facility.endingBalanceContributionKrw, displayCurrency, fxRateToKrw)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{facility.drawCount} draws in schedule</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No stored debt facilities yet. The current valuation is likely leaning on the synthetic underwriting facility.
          </div>
        )}
      </Card>
    </div>
  );
}
