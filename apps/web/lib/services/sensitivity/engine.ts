import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';

type SensitivityMetricName = 'Value' | 'DSCR';

export type SensitivityPointResult = {
  variableKey: string;
  variableLabel: string;
  shockLabel: string;
  shockValue: number;
  metricName: SensitivityMetricName;
  metricValue: number;
  deltaPct: number;
  sortOrder: number;
};

export type SensitivityRunResult = {
  runType: 'ONE_WAY' | 'BREACH_POINT' | 'MATRIX';
  title: string;
  baselineMetricName: SensitivityMetricName;
  baselineMetricValue: number;
  summary: {
    strongestDownsideDriver: string | null;
    strongestDownsideDeltaPct: number | null;
    pointCount: number;
    rowLabels?: string[];
    columnLabels?: string[];
    rowAxisLabel?: string;
    columnAxisLabel?: string;
  };
  points: SensitivityPointResult[];
};

type AnalysisLike = {
  baseCaseValueKrw: number;
  assumptions: Record<string, unknown>;
  scenarios: Array<{
    name: string;
    debtServiceCoverage?: number | null;
  }>;
};

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getMetric(assumptions: Record<string, unknown>, key: string) {
  const rootValue = toNumber(assumptions[key]);
  if (rootValue !== null) return rootValue;

  const metrics = assumptions.metrics as Record<string, unknown> | undefined;
  if (!metrics) return null;
  return toNumber(metrics[key]);
}

function getCreditAssumptions(assumptions: Record<string, unknown>) {
  return typeof assumptions.credit === 'object' && assumptions.credit !== null
    ? (assumptions.credit as {
        weakestCounterparty?: {
          name?: string;
          role?: string;
          riskLevel?: string;
          score?: number;
        } | null;
        riskMix?: {
          high?: number;
          moderate?: number;
          low?: number;
        };
        liquiditySignals?: {
          refinanceRiskLevel?: string;
          covenantPressureLevel?: string;
          downsideDscrHaircutPct?: number;
          downsideValueHaircutPct?: number;
        };
      })
    : null;
}

function getAssetClass(assumptions: Record<string, unknown>) {
  const rootValue = assumptions.assetClass;
  if (typeof rootValue === 'string' && rootValue.length > 0) return rootValue;

  const metrics = assumptions.metrics as Record<string, unknown> | undefined;
  const metricsValue = metrics?.assetClass;
  return typeof metricsValue === 'string' && metricsValue.length > 0 ? metricsValue : null;
}

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

function roundDelta(value: number) {
  return Number(value.toFixed(2));
}

function buildValuePoint(args: {
  variableKey: string;
  variableLabel: string;
  shockLabel: string;
  shockValue: number;
  metricValue: number;
  baselineValue: number;
  sortOrder: number;
}): SensitivityPointResult {
  return {
    variableKey: args.variableKey,
    variableLabel: args.variableLabel,
    shockLabel: args.shockLabel,
    shockValue: args.shockValue,
    metricName: 'Value',
    metricValue: roundMetric(args.metricValue),
    deltaPct: roundDelta(((args.metricValue - args.baselineValue) / args.baselineValue) * 100),
    sortOrder: args.sortOrder
  };
}

function buildDscrPoint(args: {
  variableKey: string;
  variableLabel: string;
  shockLabel: string;
  shockValue: number;
  metricValue: number;
  baselineValue: number;
  sortOrder: number;
}): SensitivityPointResult {
  return {
    variableKey: args.variableKey,
    variableLabel: args.variableLabel,
    shockLabel: args.shockLabel,
    shockValue: args.shockValue,
    metricName: 'DSCR',
    metricValue: roundMetric(args.metricValue),
    deltaPct: roundDelta(((args.metricValue - args.baselineValue) / Math.max(args.baselineValue, 0.01)) * 100),
    sortOrder: args.sortOrder
  };
}

export function buildOneWaySensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const baselineValue = Math.max(analysis.baseCaseValueKrw, 1);
  const baselineDscr = pickBaseDscr(analysis.scenarios) ?? 1;
  const baseCapRatePct = getMetric(analysis.assumptions, 'capRatePct') ?? 6;
  const baseDiscountRatePct = getMetric(analysis.assumptions, 'discountRatePct') ?? 8.5;
  const baseOccupancyPct = getMetric(analysis.assumptions, 'occupancyPct') ?? 90;
  const baseDebtCostPct = getMetric(analysis.assumptions, 'debtCostPct') ?? 5;

  const points: SensitivityPointResult[] = [
    buildValuePoint({
      variableKey: 'cap_rate_pct',
      variableLabel: 'Exit Cap Rate',
      shockLabel: '+50 bps',
      shockValue: 0.5,
      metricValue: baselineValue * (baseCapRatePct / (baseCapRatePct + 0.5)),
      baselineValue,
      sortOrder: 0
    }),
    buildValuePoint({
      variableKey: 'cap_rate_pct',
      variableLabel: 'Exit Cap Rate',
      shockLabel: '-50 bps',
      shockValue: -0.5,
      metricValue: baselineValue * (baseCapRatePct / Math.max(baseCapRatePct - 0.5, 0.25)),
      baselineValue,
      sortOrder: 1
    }),
    buildValuePoint({
      variableKey: 'occupancy_pct',
      variableLabel: 'Occupancy',
      shockLabel: '-5 pts',
      shockValue: -5,
      metricValue: baselineValue * (Math.max(baseOccupancyPct - 5, 35) / Math.max(baseOccupancyPct, 1)),
      baselineValue,
      sortOrder: 2
    }),
    buildValuePoint({
      variableKey: 'occupancy_pct',
      variableLabel: 'Occupancy',
      shockLabel: '+5 pts',
      shockValue: 5,
      metricValue: baselineValue * (Math.min(baseOccupancyPct + 5, 100) / Math.max(baseOccupancyPct, 1)),
      baselineValue,
      sortOrder: 3
    }),
    buildValuePoint({
      variableKey: 'discount_rate_pct',
      variableLabel: 'Discount Rate',
      shockLabel: '+50 bps',
      shockValue: 0.5,
      metricValue: baselineValue * (baseDiscountRatePct / (baseDiscountRatePct + 0.5)),
      baselineValue,
      sortOrder: 4
    }),
    buildValuePoint({
      variableKey: 'discount_rate_pct',
      variableLabel: 'Discount Rate',
      shockLabel: '-50 bps',
      shockValue: -0.5,
      metricValue: baselineValue * (baseDiscountRatePct / Math.max(baseDiscountRatePct - 0.5, 0.5)),
      baselineValue,
      sortOrder: 5
    }),
    buildDscrPoint({
      variableKey: 'debt_cost_pct',
      variableLabel: 'Debt Cost',
      shockLabel: '+100 bps',
      shockValue: 1,
      metricValue: baselineDscr * (baseDebtCostPct / (baseDebtCostPct + 1)),
      baselineValue: baselineDscr,
      sortOrder: 6
    }),
    buildDscrPoint({
      variableKey: 'debt_cost_pct',
      variableLabel: 'Debt Cost',
      shockLabel: '-100 bps',
      shockValue: -1,
      metricValue: baselineDscr * (baseDebtCostPct / Math.max(baseDebtCostPct - 1, 0.5)),
      baselineValue: baselineDscr,
      sortOrder: 7
    })
  ];

  const strongestDownside = points
    .filter((point) => point.deltaPct < 0)
    .sort((left, right) => left.deltaPct - right.deltaPct)[0];

  return {
    runType: 'ONE_WAY',
    title: 'One-way sensitivity screen',
    baselineMetricName: 'Value',
    baselineMetricValue: roundMetric(baselineValue),
    summary: {
      strongestDownsideDriver: strongestDownside
        ? `${strongestDownside.variableLabel} ${strongestDownside.shockLabel}`
        : null,
      strongestDownsideDeltaPct: strongestDownside?.deltaPct ?? null,
      pointCount: points.length
    },
    points
  };
}

export function buildBreachPointSensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const assumptions = analysis.assumptions;
  const baselineDscr = pickBaseDscr(analysis.scenarios) ?? 1;
  const baseOccupancyPct = getMetric(assumptions, 'occupancyPct') ?? 90;
  const baseDebtCostPct = getMetric(assumptions, 'debtCostPct') ?? 5;
  const credit = getCreditAssumptions(assumptions);
  const weakest = credit?.weakestCounterparty ?? null;
  const hasHighRisk = (credit?.riskMix?.high ?? 0) > 0;
  const liquiditySignals = credit?.liquiditySignals ?? null;

  const breakevenOccupancyPct = Math.max(35, Math.min(100, (baseOccupancyPct / Math.max(baselineDscr, 0.01)) * 1));
  const breakevenDebtCostPct = Math.max(0.5, baseDebtCostPct * Math.max(baselineDscr, 1));
  const noiDeclineToDscrOnePct = Number((Math.max(0, 1 - 1 / Math.max(baselineDscr, 0.01)) * 100).toFixed(2));
  const creditNoiHaircutPct = hasHighRisk ? 12 : weakest?.riskLevel === 'MODERATE' ? 7 : 4;
  const stressedDscr = roundMetric(baselineDscr * (1 - creditNoiHaircutPct / 100));
  const refinanceHaircutPct = Math.max(liquiditySignals?.downsideDscrHaircutPct ?? 0, 0);
  const refinanceStressedDscr = roundMetric(baselineDscr * (1 - refinanceHaircutPct / 100));

  const points: SensitivityPointResult[] = [
    {
      variableKey: 'occupancy_breakeven_pct',
      variableLabel: 'Occupancy Break-even',
      shockLabel: `${roundMetric(breakevenOccupancyPct)}%`,
      shockValue: roundMetric(breakevenOccupancyPct),
      metricName: 'DSCR',
      metricValue: 1,
      deltaPct: roundDelta(((breakevenOccupancyPct - baseOccupancyPct) / Math.max(baseOccupancyPct, 1)) * 100),
      sortOrder: 0
    },
    {
      variableKey: 'debt_cost_breakeven_pct',
      variableLabel: 'Debt Cost Break-even',
      shockLabel: `${roundMetric(breakevenDebtCostPct)}%`,
      shockValue: roundMetric(breakevenDebtCostPct),
      metricName: 'DSCR',
      metricValue: 1,
      deltaPct: roundDelta(((breakevenDebtCostPct - baseDebtCostPct) / Math.max(baseDebtCostPct, 0.1)) * 100),
      sortOrder: 1
    },
    {
      variableKey: 'noi_decline_breakeven_pct',
      variableLabel: 'NOI Decline To 1.0x',
      shockLabel: `-${roundMetric(noiDeclineToDscrOnePct)}%`,
      shockValue: -roundMetric(noiDeclineToDscrOnePct),
      metricName: 'DSCR',
      metricValue: 1,
      deltaPct: -roundMetric(noiDeclineToDscrOnePct),
      sortOrder: 2
    },
    {
      variableKey: 'counterparty_credit_stress',
      variableLabel: 'Counterparty Credit Stress',
      shockLabel: weakest?.name ? `${weakest.name} stress` : 'portfolio stress',
      shockValue: -creditNoiHaircutPct,
      metricName: 'DSCR',
      metricValue: stressedDscr,
      deltaPct: roundDelta(((stressedDscr - baselineDscr) / Math.max(baselineDscr, 0.01)) * 100),
      sortOrder: 3
    },
    ...(refinanceHaircutPct > 0
      ? [
          {
            variableKey: 'refinance_covenant_stress',
            variableLabel: 'Refinance / Covenant Stress',
            shockLabel: `${liquiditySignals?.refinanceRiskLevel?.toLowerCase() ?? 'liquidity'} refi case`,
            shockValue: -roundMetric(refinanceHaircutPct),
            metricName: 'DSCR' as const,
            metricValue: refinanceStressedDscr,
            deltaPct: roundDelta(((refinanceStressedDscr - baselineDscr) / Math.max(baselineDscr, 0.01)) * 100),
            sortOrder: 4
          }
        ]
      : [])
  ];

  const strongestDownside = points
    .filter((point) => point.deltaPct < 0)
    .sort((left, right) => left.deltaPct - right.deltaPct)[0];

  return {
    runType: 'BREACH_POINT',
    title: 'Break-even and credit stress',
    baselineMetricName: 'DSCR',
    baselineMetricValue: roundMetric(baselineDscr),
    summary: {
      strongestDownsideDriver: strongestDownside
        ? `${strongestDownside.variableLabel} ${strongestDownside.shockLabel}`
        : null,
      strongestDownsideDeltaPct: strongestDownside?.deltaPct ?? null,
      pointCount: points.length
    },
    points
  };
}

export function buildTwoWayMatrixSensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const baselineValue = Math.max(analysis.baseCaseValueKrw, 1);
  const assetClass = getAssetClass(analysis.assumptions);
  const baseCapRatePct = getMetric(analysis.assumptions, 'capRatePct') ?? 6;
  const baseOccupancyPct = getMetric(analysis.assumptions, 'occupancyPct') ?? 90;
  const isDataCenter = assetClass === 'DATA_CENTER';
  const occupancyShocks = [
    { label: '-5 pts', value: -5 },
    { label: 'Base', value: 0 },
    { label: '+5 pts', value: 5 }
  ];
  const capRateShocks = [
    { label: '+50 bps', value: 0.5 },
    { label: 'Base', value: 0 },
    { label: '-50 bps', value: -0.5 }
  ];

  const points: SensitivityPointResult[] = [];

  for (const [rowIndex, occupancyShock] of occupancyShocks.entries()) {
    const shockedOccupancyPct = Math.min(100, Math.max(35, baseOccupancyPct + occupancyShock.value));

    for (const [columnIndex, capRateShock] of capRateShocks.entries()) {
      const shockedCapRatePct = Math.max(0.25, baseCapRatePct + capRateShock.value);
      const metricValue =
        baselineValue *
        (shockedOccupancyPct / Math.max(baseOccupancyPct, 1)) *
        (baseCapRatePct / shockedCapRatePct);

      points.push(
        buildValuePoint({
          variableKey: isDataCenter ? 'utilization_cap_rate_matrix' : 'occupancy_cap_rate_matrix',
          variableLabel: isDataCenter ? 'Utilization x Exit Cap' : 'Occupancy x Exit Cap',
          shockLabel: `${occupancyShock.label} / ${capRateShock.label}`,
          shockValue: rowIndex * 10 + columnIndex,
          metricValue,
          baselineValue,
          sortOrder: rowIndex * capRateShocks.length + columnIndex
        })
      );
    }
  }

  const strongestDownside = points
    .filter((point) => point.deltaPct < 0)
    .sort((left, right) => left.deltaPct - right.deltaPct)[0];

  return {
    runType: 'MATRIX',
    title: isDataCenter ? 'Two-way matrix: utilization x exit cap' : 'Two-way matrix: occupancy x exit cap',
    baselineMetricName: 'Value',
    baselineMetricValue: roundMetric(baselineValue),
    summary: {
      strongestDownsideDriver: strongestDownside
        ? `${strongestDownside.variableLabel} ${strongestDownside.shockLabel}`
        : null,
      strongestDownsideDeltaPct: strongestDownside?.deltaPct ?? null,
      pointCount: points.length,
      rowLabels: occupancyShocks.map((shock) => shock.label),
      columnLabels: capRateShocks.map((shock) => shock.label),
      rowAxisLabel: isDataCenter ? 'Utilization' : 'Occupancy',
      columnAxisLabel: 'Exit Cap'
    },
    points
  };
}

export function buildDebtNoiMatrixSensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const baselineDscr = pickBaseDscr(analysis.scenarios) ?? 1;
  const assetClass = getAssetClass(analysis.assumptions);
  const baseDebtCostPct = getMetric(analysis.assumptions, 'debtCostPct') ?? 5;
  const basePowerPriceKrwPerKwh = getMetric(analysis.assumptions, 'powerPriceKrwPerKwh') ?? 180;
  const isDataCenter = assetClass === 'DATA_CENTER';
  const rowShocks = isDataCenter
    ? [
        { label: '+10%', value: 0.1 },
        { label: 'Base', value: 0 },
        { label: '-10%', value: -0.1 }
      ]
    : [
        { label: '-10%', value: -0.1 },
        { label: 'Base', value: 0 },
        { label: '+10%', value: 0.1 }
      ];
  const debtCostShocks = [
    { label: '+100 bps', value: 1 },
    { label: 'Base', value: 0 },
    { label: '-100 bps', value: -1 }
  ];

  const points: SensitivityPointResult[] = [];

  for (const [rowIndex, rowShock] of rowShocks.entries()) {
    const rowFactor = isDataCenter ? basePowerPriceKrwPerKwh / Math.max(basePowerPriceKrwPerKwh * (1 + rowShock.value), 1) : 1 + rowShock.value;

    for (const [columnIndex, debtShock] of debtCostShocks.entries()) {
      const shockedDebtCostPct = Math.max(0.5, baseDebtCostPct + debtShock.value);
      const metricValue = baselineDscr * rowFactor * (baseDebtCostPct / shockedDebtCostPct);

      points.push(
        buildDscrPoint({
          variableKey: isDataCenter ? 'power_price_debt_cost_matrix' : 'noi_debt_cost_matrix',
          variableLabel: isDataCenter ? 'Power Price x Debt Cost' : 'NOI x Debt Cost',
          shockLabel: `${rowShock.label} / ${debtShock.label}`,
          shockValue: rowIndex * 10 + columnIndex,
          metricValue,
          baselineValue: baselineDscr,
          sortOrder: rowIndex * debtCostShocks.length + columnIndex
        })
      );
    }
  }

  const strongestDownside = points
    .filter((point) => point.deltaPct < 0)
    .sort((left, right) => left.deltaPct - right.deltaPct)[0];

  return {
    runType: 'MATRIX',
    title: isDataCenter ? 'Two-way matrix: power price x debt cost' : 'Two-way matrix: NOI x debt cost',
    baselineMetricName: 'DSCR',
    baselineMetricValue: roundMetric(baselineDscr),
    summary: {
      strongestDownsideDriver: strongestDownside
        ? `${strongestDownside.variableLabel} ${strongestDownside.shockLabel}`
        : null,
      strongestDownsideDeltaPct: strongestDownside?.deltaPct ?? null,
      pointCount: points.length,
      rowLabels: rowShocks.map((shock) => shock.label),
      columnLabels: debtCostShocks.map((shock) => shock.label),
      rowAxisLabel: isDataCenter ? 'Power Price' : 'NOI',
      columnAxisLabel: 'Debt Cost'
    },
    points
  };
}

export function buildSensitivityRuns(analysis: AnalysisLike): SensitivityRunResult[] {
  return [
    buildOneWaySensitivityRun(analysis),
    buildBreachPointSensitivityRun(analysis),
    buildTwoWayMatrixSensitivityRun(analysis),
    buildDebtNoiMatrixSensitivityRun(analysis)
  ];
}
