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
  runType: 'ONE_WAY' | 'BREACH_POINT' | 'MATRIX' | 'FORECAST' | 'MONTE_CARLO';
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
    forecastYears?: number;
    yearFiveValueDeltaPct?: number | null;
    yearFiveDscrDeltaPct?: number | null;
    simulations?: number;
    downsideProbabilityPct?: number;
    covenantBreachProbabilityPct?: number;
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

type MacroRegimeLike = {
  guidance?: {
    discountRateShiftPct?: number;
    exitCapRateShiftPct?: number;
    debtCostShiftPct?: number;
    occupancyShiftPct?: number;
    growthShiftPct?: number;
    replacementCostShiftPct?: number;
  };
  impacts?: {
    dimensions?: Array<{
      key?: string;
      score?: number | null;
    }>;
  };
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

function getMacroRegime(assumptions: Record<string, unknown>): MacroRegimeLike | null {
  return typeof assumptions.macroRegime === 'object' && assumptions.macroRegime !== null
    ? (assumptions.macroRegime as MacroRegimeLike)
    : null;
}

function getMacroImpactScore(assumptions: Record<string, unknown>, key: string) {
  const macroRegime = getMacroRegime(assumptions);
  const dimensions = macroRegime?.impacts?.dimensions;
  if (!Array.isArray(dimensions)) return 0;
  const point = dimensions.find((dimension) => dimension?.key === key);
  return toNumber(point?.score) ?? 0;
}

function getMacroGuidanceShift(assumptions: Record<string, unknown>, key: keyof NonNullable<MacroRegimeLike['guidance']>) {
  const macroRegime = getMacroRegime(assumptions);
  return toNumber(macroRegime?.guidance?.[key]) ?? 0;
}

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

function roundDelta(value: number) {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percentile(sortedValues: number[], pct: number) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * pct;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower] ?? 0;
  const weight = index - lower;
  return (sortedValues[lower] ?? 0) * (1 - weight) + (sortedValues[upper] ?? 0) * weight;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawCentered(random: () => number) {
  return (random() + random() + random()) / 3 - 0.5;
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

export function buildForecastSensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const baselineValue = Math.max(analysis.baseCaseValueKrw, 1);
  const baselineDscr = pickBaseDscr(analysis.scenarios) ?? 1;
  const assumptions = analysis.assumptions;
  const pricingScore = getMacroImpactScore(assumptions, 'pricing');
  const leasingScore = getMacroImpactScore(assumptions, 'leasing');
  const financingScore = getMacroImpactScore(assumptions, 'financing');
  const refinancingScore = getMacroImpactScore(assumptions, 'refinancing');
  const allocationScore = getMacroImpactScore(assumptions, 'allocation');
  const occupancyShiftPct = getMacroGuidanceShift(assumptions, 'occupancyShiftPct');
  const growthShiftPct = getMacroGuidanceShift(assumptions, 'growthShiftPct');
  const debtCostShiftPct = getMacroGuidanceShift(assumptions, 'debtCostShiftPct');

  const annualValueDriftPct =
    leasingScore * 2.2 +
    allocationScore * 1.3 +
    pricingScore * 1.8 -
    refinancingScore * 1.1 +
    growthShiftPct * 0.8 -
    Math.abs(debtCostShiftPct) * 0.9;
  const annualDscrDriftPct =
    leasingScore * 3 +
    pricingScore * 0.8 -
    financingScore * 2.8 -
    refinancingScore * 1.5 +
    occupancyShiftPct * 0.4 -
    debtCostShiftPct * 4;

  const points: SensitivityPointResult[] = [];

  for (let year = 1; year <= 5; year += 1) {
    const valueMetric = baselineValue * clamp(1 + (annualValueDriftPct / 100) * year, 0.55, 1.65);
    const dscrMetric = baselineDscr * clamp(1 + (annualDscrDriftPct / 100) * year, 0.55, 1.55);

    points.push(
      buildValuePoint({
        variableKey: 'forecast_value_path',
        variableLabel: 'Forecast Value Path',
        shockLabel: `Year ${year}`,
        shockValue: year,
        metricValue: valueMetric,
        baselineValue,
        sortOrder: year - 1
      }),
      buildDscrPoint({
        variableKey: 'forecast_dscr_path',
        variableLabel: 'Forecast DSCR Path',
        shockLabel: `Year ${year}`,
        shockValue: year,
        metricValue: dscrMetric,
        baselineValue: baselineDscr,
        sortOrder: 100 + year - 1
      })
    );
  }

  const yearFiveValue = points.find((point) => point.variableKey === 'forecast_value_path' && point.shockValue === 5);
  const yearFiveDscr = points.find((point) => point.variableKey === 'forecast_dscr_path' && point.shockValue === 5);

  return {
    runType: 'FORECAST',
    title: 'Five-year macro forecast path',
    baselineMetricName: 'Value',
    baselineMetricValue: roundMetric(baselineValue),
    summary: {
      strongestDownsideDriver:
        yearFiveValue && yearFiveValue.deltaPct < 0 ? `Year 5 value ${yearFiveValue.deltaPct}%` : null,
      strongestDownsideDeltaPct: yearFiveValue?.deltaPct ?? null,
      pointCount: points.length,
      forecastYears: 5,
      yearFiveValueDeltaPct: yearFiveValue?.deltaPct ?? null,
      yearFiveDscrDeltaPct: yearFiveDscr?.deltaPct ?? null
    },
    points
  };
}

export function buildMonteCarloSensitivityRun(analysis: AnalysisLike): SensitivityRunResult {
  const baselineValue = Math.max(analysis.baseCaseValueKrw, 1);
  const baselineDscr = pickBaseDscr(analysis.scenarios) ?? 1;
  const assumptions = analysis.assumptions;
  const pricingScore = getMacroImpactScore(assumptions, 'pricing');
  const leasingScore = getMacroImpactScore(assumptions, 'leasing');
  const financingScore = getMacroImpactScore(assumptions, 'financing');
  const refinancingScore = getMacroImpactScore(assumptions, 'refinancing');
  const allocationScore = getMacroImpactScore(assumptions, 'allocation');
  const baseCapRatePct = getMetric(assumptions, 'capRatePct') ?? 6;
  const baseOccupancyPct = getMetric(assumptions, 'occupancyPct') ?? 90;
  const baseDebtCostPct = getMetric(assumptions, 'debtCostPct') ?? 5;
  const growthShiftPct = getMacroGuidanceShift(assumptions, 'growthShiftPct');

  const random = createSeededRandom(
    Math.round(baselineValue / 1_000_000) ^
      Math.round(baseCapRatePct * 100) ^
      Math.round(baseOccupancyPct * 10) ^
      Math.round(baseDebtCostPct * 100)
  );
  const valueOutcomes: number[] = [];
  const dscrOutcomes: number[] = [];
  const iterations = 250;

  for (let i = 0; i < iterations; i += 1) {
    const occupancyShockPts = drawCentered(random) * (8 + Math.abs(leasingScore) * 3) + leasingScore * 2;
    const exitCapShockPct = drawCentered(random) * 0.75 + (refinancingScore - pricingScore) * 0.08;
    const debtShockPct = drawCentered(random) * 1.1 + (financingScore - allocationScore) * 0.12;
    const growthShockPct = drawCentered(random) * 1.4 + growthShiftPct * 0.6 + leasingScore * 0.35;

    const shockedOccupancyPct = clamp(baseOccupancyPct + occupancyShockPts, 45, 100);
    const shockedExitCapPct = clamp(baseCapRatePct + exitCapShockPct, 0.5, 15);
    const shockedDebtCostPct = clamp(baseDebtCostPct + debtShockPct, 0.5, 15);

    const occupancyFactor = shockedOccupancyPct / Math.max(baseOccupancyPct, 1);
    const capFactor = baseCapRatePct / shockedExitCapPct;
    const growthFactor = clamp(1 + growthShockPct / 100, 0.85, 1.2);
    const debtDrag = clamp(baseDebtCostPct / shockedDebtCostPct, 0.7, 1.25);

    valueOutcomes.push(baselineValue * occupancyFactor * capFactor * growthFactor * (0.9 + debtDrag * 0.1));
    dscrOutcomes.push(baselineDscr * occupancyFactor * debtDrag);
  }

  valueOutcomes.sort((left, right) => left - right);
  dscrOutcomes.sort((left, right) => left - right);

  const percentileDefs = [
    { pct: 0.1, label: 'P10' },
    { pct: 0.25, label: 'P25' },
    { pct: 0.5, label: 'P50' },
    { pct: 0.75, label: 'P75' },
    { pct: 0.9, label: 'P90' }
  ];

  const points: SensitivityPointResult[] = percentileDefs.flatMap((item, index) => {
    const valueMetric = percentile(valueOutcomes, item.pct);
    const dscrMetric = percentile(dscrOutcomes, item.pct);
    return [
      buildValuePoint({
        variableKey: 'monte_carlo_value',
        variableLabel: 'Monte Carlo Value',
        shockLabel: item.label,
        shockValue: item.pct * 100,
        metricValue: valueMetric,
        baselineValue,
        sortOrder: index
      }),
      buildDscrPoint({
        variableKey: 'monte_carlo_dscr',
        variableLabel: 'Monte Carlo DSCR',
        shockLabel: item.label,
        shockValue: item.pct * 100,
        metricValue: dscrMetric,
        baselineValue: baselineDscr,
        sortOrder: 100 + index
      })
    ];
  });

  const downsideProbabilityPct = roundMetric(
    (valueOutcomes.filter((value) => value < baselineValue * 0.9).length / iterations) * 100
  );
  const covenantBreachProbabilityPct = roundMetric(
    (dscrOutcomes.filter((value) => value < 1).length / iterations) * 100
  );

  return {
    runType: 'MONTE_CARLO',
    title: 'Monte Carlo distribution envelope',
    baselineMetricName: 'Value',
    baselineMetricValue: roundMetric(baselineValue),
    summary: {
      strongestDownsideDriver: 'Value < -10% or DSCR < 1.0x',
      strongestDownsideDeltaPct: -10,
      pointCount: points.length,
      simulations: iterations,
      downsideProbabilityPct,
      covenantBreachProbabilityPct
    },
    points
  };
}

export function buildSensitivityRuns(analysis: AnalysisLike): SensitivityRunResult[] {
  return [
    buildOneWaySensitivityRun(analysis),
    buildBreachPointSensitivityRun(analysis),
    buildTwoWayMatrixSensitivityRun(analysis),
    buildDebtNoiMatrixSensitivityRun(analysis),
    buildForecastSensitivityRun(analysis),
    buildMonteCarloSensitivityRun(analysis)
  ];
}
