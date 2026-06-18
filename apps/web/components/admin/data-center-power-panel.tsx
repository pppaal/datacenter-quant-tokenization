import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent } from '@/lib/utils';

type DataCenterDetail = {
  powerCapacityMw?: number | null;
  targetItLoadMw?: number | null;
  pueTarget?: number | null;
  utilityName?: string | null;
  substationDistanceKm?: number | null;
  renewablePct?: number | null;
  redundancyTier?: string | null;
  coolingType?: string | null;
  fiberAccess?: string | null;
  latencyProfile?: string | null;
};

type EnergySnapshot = {
  utilityName?: string | null;
  substationDistanceKm?: number | null;
  tariffKrwPerKwh?: number | null;
  renewableAvailabilityPct?: number | null;
  pueTarget?: number | null;
  backupFuelHours?: number | null;
};

type MarketSnapshot = {
  colocationRatePerKwKrw?: number | null;
  constructionCostPerMwKrw?: number | null;
  capRatePct?: number | null;
};

type PermitSnapshot = {
  powerApprovalStatus?: string | null;
};

type SiteProfile = {
  gridAvailability?: string | null;
  fiberAccess?: string | null;
};

type Props = {
  powerCapacityMw?: number | null;
  targetItLoadMw?: number | null;
  detail?: DataCenterDetail | null;
  energy?: EnergySnapshot | null;
  market?: MarketSnapshot | null;
  permit?: PermitSnapshot | null;
  siteProfile?: SiteProfile | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

type Metric = {
  label: string;
  value: string;
  hint?: string;
};

const TEXT = '—';

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return null;
}

function MetricGroup({ title, metrics }: { title: string; metrics: Metric[] }) {
  return (
    <div className="rounded-[12px] border border-border bg-[hsl(var(--panel-alt))] p-4">
      <div className="fine-print">{title}</div>
      <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{metric.label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {metric.value}
            </dd>
            {metric.hint ? <dd className="mt-0.5 text-xs text-muted">{metric.hint}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Power & critical-systems block — the single biggest "written by someone who
 * knows data centers" signal. Surfaces the contracted/built MW, PUE, ₩/kWh
 * tariff, redundancy tier, cooling, grid connection and ₩/kW commercial
 * pricing that an institutional DC underwriter expects to lead with, all from
 * data already captured on the asset (DataCenterDetail / EnergySnapshot /
 * MarketSnapshot / PermitSnapshot). Rendered only for DATA_CENTER assets.
 */
export function DataCenterPowerPanel({
  powerCapacityMw,
  targetItLoadMw,
  detail,
  energy,
  market,
  permit,
  siteProfile,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const builtMw = firstNumber(detail?.powerCapacityMw, powerCapacityMw);
  const itLoadMw = firstNumber(detail?.targetItLoadMw, targetItLoadMw);
  const utilizationPct =
    builtMw && builtMw > 0 && itLoadMw != null ? (itLoadMw / builtMw) * 100 : null;
  const pue = firstNumber(detail?.pueTarget, energy?.pueTarget);
  const renewablePct = firstNumber(detail?.renewablePct, energy?.renewableAvailabilityPct);
  const tariff = firstNumber(energy?.tariffKrwPerKwh);
  const substationKm = firstNumber(detail?.substationDistanceKm, energy?.substationDistanceKm);
  const backupHours = firstNumber(energy?.backupFuelHours);
  const buildCostPerKwKrw =
    market?.constructionCostPerMwKrw && Number.isFinite(market.constructionCostPerMwKrw)
      ? market.constructionCostPerMwKrw / 1000
      : null;

  const money = (krw: number | null) =>
    krw == null ? TEXT : formatCompactCurrencyFromKrwAtRate(krw, displayCurrency, fxRateToKrw);

  const capacity: Metric[] = [
    {
      label: 'Built Power',
      value: builtMw != null ? `${formatNumber(builtMw, 1)} MW` : TEXT
    },
    {
      label: 'Critical IT Load',
      value: itLoadMw != null ? `${formatNumber(itLoadMw, 1)} MW` : TEXT,
      hint: utilizationPct != null ? `${formatPercent(utilizationPct)} of built` : undefined
    },
    {
      label: 'Build Cost / kW',
      value: money(buildCostPerKwKrw)
    }
  ];

  const efficiency: Metric[] = [
    { label: 'PUE (design)', value: pue != null ? formatNumber(pue, 2) : TEXT },
    { label: 'Renewable Supply', value: renewablePct != null ? formatPercent(renewablePct) : TEXT },
    { label: 'Power Tariff', value: tariff != null ? `${formatNumber(tariff, 1)} ₩/kWh` : TEXT }
  ];

  const resilience: Metric[] = [
    { label: 'Redundancy Tier', value: firstText(detail?.redundancyTier) ?? TEXT },
    { label: 'Cooling', value: firstText(detail?.coolingType) ?? TEXT },
    {
      label: 'Backup Fuel',
      value: backupHours != null ? `${formatNumber(backupHours, 0)} hrs` : TEXT
    }
  ];

  const grid: Metric[] = [
    { label: 'Utility', value: firstText(detail?.utilityName, energy?.utilityName) ?? TEXT },
    {
      label: 'Substation Distance',
      value: substationKm != null ? `${formatNumber(substationKm, 1)} km` : TEXT
    },
    {
      label: 'Power Approval',
      value: firstText(permit?.powerApprovalStatus, siteProfile?.gridAvailability) ?? TEXT
    },
    {
      label: 'Connectivity',
      value: firstText(detail?.fiberAccess, siteProfile?.fiberAccess) ?? TEXT
    },
    { label: 'Latency Profile', value: firstText(detail?.latencyProfile) ?? TEXT },
    {
      label: 'Colocation Rate',
      value:
        market?.colocationRatePerKwKrw != null
          ? `${money(market.colocationRatePerKwKrw)} / kW·mo`
          : TEXT
    }
  ];

  return (
    <Card data-testid="data-center-power-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Power &amp; Critical Systems</div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Capacity, efficiency, resilience, and grid
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            The physical and commercial profile that drives a data-center valuation — power is the
            product. Priced per ₩/kW alongside the ₩/sqm view, with grid-connection and redundancy
            posture an institutional underwriter screens first.
          </p>
        </div>
        {firstText(detail?.redundancyTier) ? (
          <Badge tone="good">{detail?.redundancyTier}</Badge>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <MetricGroup title="Power & Capacity" metrics={capacity} />
        <MetricGroup title="Efficiency & Sustainability" metrics={efficiency} />
        <MetricGroup title="Resilience & Design" metrics={resilience} />
        <MetricGroup title="Grid, Connectivity & Commercial" metrics={grid} />
      </div>
    </Card>
  );
}
