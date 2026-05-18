import { computeCostApproach } from '@/lib/services/valuation/cost-approach';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import { buildDebtSchedule } from '@/lib/services/valuation/project-finance';
import { computeReturnMetrics, type ReturnMetrics } from '@/lib/services/valuation/return-metrics';
import { dataCenterScenarioInputs } from '@/lib/services/valuation/data-center-config';
import type { PreparedUnderwritingInputs, ScenarioInput } from '@/lib/services/valuation/types';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';
import type { CorrelationPenalty } from '@/lib/services/macro/correlation-stress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MacroStressLineItemImpact = {
  label: string;
  baselineKrw: number;
  stressedKrw: number;
  deltaPct: number;
};

export type MacroStressScenarioResult = {
  scenarioName: string;
  description: string;
  shocks: MacroStressScenario['shocks'];
  baseline: ReturnMetrics;
  stressed: ReturnMetrics;
  equityIrrDeltaPct: number | null;
  equityMultipleDelta: number;
  paybackShiftYears: number | null;
  stressedEndingDebtKrw: number;
  stressedAverageDscr: number | null;
  worstDscr: number | null;
  verdict: 'RESILIENT' | 'SENSITIVE' | 'VULNERABLE' | 'BREACH';
  commentary: string;
  lineItemImpacts: MacroStressLineItemImpact[];
  correlationPenaltyApplied: CorrelationPenalty | null;
};

export type MacroStressAnalysis = {
  baseline: ReturnMetrics;
  scenarios: MacroStressScenarioResult[];
};

export type MacroFactorAttribution = {
  factor: keyof MacroStressScenario['shocks'];
  factorLabel: string;
  isolatedIrrDeltaPct: number | null;
  isolatedMultipleDelta: number;
  lineItemImpacts: MacroStressLineItemImpact[];
  contributionShareOfTotalDelta: number;
};

export type MacroFactorAttributionResult = {
  scenarioName: string;
  totalIrrDeltaPct: number | null;
  totalMultipleDelta: number;
  factors: MacroFactorAttribution[];
};

// ---------------------------------------------------------------------------
// Shock application
// ---------------------------------------------------------------------------

function applyShocks(
  prepared: PreparedUnderwritingInputs,
  shocks: MacroStressScenario['shocks'],
  correlationAmpPct: number
): PreparedUnderwritingInputs {
  const amp = 1 + correlationAmpPct / 100;

  const rateShiftPct = (shocks.rateShiftBps / 100) * amp;
  const spreadShiftPct = (shocks.spreadShiftBps / 100) * amp;
  const vacancyShiftPct = shocks.vacancyShiftPct * amp;
  const growthShiftPct = shocks.growthShiftPct * amp;
  const constructionShiftPct = shocks.constructionCostShiftPct * amp;

  const shockedOccupancyPct = Math.max(20, prepared.occupancyPct - vacancyShiftPct);
  const shockedDebtCostPct = Math.max(2, prepared.baseDebtCostPct + rateShiftPct + spreadShiftPct);
  const shockedDiscountRatePct = Math.max(
    4,
    prepared.baseDiscountRatePct + rateShiftPct + spreadShiftPct * 0.5
  );
  const shockedCapRatePct = Math.max(
    3.5,
    prepared.baseCapRatePct + rateShiftPct * 0.5 + spreadShiftPct * 0.3
  );
  const shockedGrowthPct = Math.max(-5, prepared.annualGrowthPct + growthShiftPct);
  const shockedReplacementCost =
    prepared.baseReplacementCostPerMwKrw * (1 + constructionShiftPct / 100);

  return {
    ...prepared,
    occupancyPct: shockedOccupancyPct,
    baseDebtCostPct: shockedDebtCostPct,
    baseDiscountRatePct: shockedDiscountRatePct,
    baseCapRatePct: shockedCapRatePct,
    annualGrowthPct: shockedGrowthPct,
    baseReplacementCostPerMwKrw: shockedReplacementCost
  };
}

function runUnderwritingPipeline(
  prepared: PreparedUnderwritingInputs,
  scenarioInput: ScenarioInput
) {
  const costApproach = computeCostApproach(prepared, scenarioInput);
  const leaseDcf = computeLeaseDcf(prepared, scenarioInput);
  const debtSchedule = buildDebtSchedule(
    prepared,
    scenarioInput,
    leaseDcf.years.map((y) => y.cfadsBeforeDebtKrw)
  );
  const equityWaterfall = computeEquityWaterfall(
    prepared,
    scenarioInput,
    costApproach,
    leaseDcf,
    debtSchedule
  );
  return { costApproach, leaseDcf, debtSchedule, equityWaterfall };
}

function computeDscrStats(dscrValues: Array<number | null>): {
  average: number | null;
  worst: number | null;
} {
  const valid = dscrValues.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return { average: null, worst: null };
  const average = valid.reduce((s, v) => s + v, 0) / valid.length;
  const worst = Math.min(...valid);
  return {
    average: Number(average.toFixed(2)),
    worst: Number(worst.toFixed(2))
  };
}

function verdictFromMetrics(
  irrDeltaPct: number | null,
  worstDscr: number | null
): MacroStressScenarioResult['verdict'] {
  if (worstDscr !== null && worstDscr < 1.0) return 'BREACH';
  if (irrDeltaPct === null) return 'SENSITIVE';
  if (irrDeltaPct < -8) return 'VULNERABLE';
  if (irrDeltaPct < -3) return 'SENSITIVE';
  return 'RESILIENT';
}

function buildCommentary(
  scenarioName: string,
  verdict: MacroStressScenarioResult['verdict'],
  irrDeltaPct: number | null,
  worstDscr: number | null,
  correlationAmp: number
): string {
  const ampSuffix =
    correlationAmp > 0 ? ` (with +${correlationAmp.toFixed(0)}% correlation amplification)` : '';
  const deltaFmt =
    irrDeltaPct === null ? 'n/a' : `${irrDeltaPct >= 0 ? '+' : ''}${irrDeltaPct.toFixed(1)}pp`;
  const dscrFmt = worstDscr === null ? 'n/a' : worstDscr.toFixed(2);

  switch (verdict) {
    case 'BREACH':
      return `"${scenarioName}" triggers a covenant breach${ampSuffix}: worst-year DSCR ${dscrFmt}, equity IRR shift ${deltaFmt}. Covenant waiver or restructure required.`;
    case 'VULNERABLE':
      return `"${scenarioName}" materially impairs returns${ampSuffix}: equity IRR shifts ${deltaFmt}, worst DSCR ${dscrFmt}. Structure cannot absorb this scenario without equity injection.`;
    case 'SENSITIVE':
      return `"${scenarioName}" erodes returns${ampSuffix}: equity IRR shifts ${deltaFmt}. Monitor trend indicators and refinancing windows.`;
    default:
      return `"${scenarioName}" is absorbed by the structure${ampSuffix}: equity IRR shifts ${deltaFmt}, worst DSCR ${dscrFmt}.`;
  }
}

function buildLineItemImpacts(
  baselineLeaseDcf: ReturnType<typeof computeLeaseDcf>,
  stressedLeaseDcf: ReturnType<typeof computeLeaseDcf>,
  baselineDebt: ReturnType<typeof buildDebtSchedule>,
  stressedDebt: ReturnType<typeof buildDebtSchedule>
): MacroStressLineItemImpact[] {
  const firstBaselineYear = baselineLeaseDcf.years[0];
  const firstStressedYear = stressedLeaseDcf.years[0];
  const baselineTotalInterest = baselineDebt.years.reduce((s, y) => s + y.interestKrw, 0);
  const stressedTotalInterest = stressedDebt.years.reduce((s, y) => s + y.interestKrw, 0);

  const items: MacroStressLineItemImpact[] = [
    {
      label: 'Year-1 Revenue',
      baselineKrw: firstBaselineYear?.totalOperatingRevenueKrw ?? 0,
      stressedKrw: firstStressedYear?.totalOperatingRevenueKrw ?? 0,
      deltaPct: 0
    },
    {
      label: 'Year-1 NOI',
      baselineKrw: firstBaselineYear?.noiKrw ?? 0,
      stressedKrw: firstStressedYear?.noiKrw ?? 0,
      deltaPct: 0
    },
    {
      label: 'Terminal Value',
      baselineKrw: baselineLeaseDcf.terminalValueKrw,
      stressedKrw: stressedLeaseDcf.terminalValueKrw,
      deltaPct: 0
    },
    {
      label: 'Total Interest',
      baselineKrw: baselineTotalInterest,
      stressedKrw: stressedTotalInterest,
      deltaPct: 0
    }
  ];

  for (const item of items) {
    item.deltaPct =
      item.baselineKrw > 0
        ? Number((((item.stressedKrw - item.baselineKrw) / item.baselineKrw) * 100).toFixed(2))
        : 0;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Core: run a single macro scenario by re-executing the proforma pipeline
// ---------------------------------------------------------------------------

export function runMacroProFormaStress(
  prepared: PreparedUnderwritingInputs,
  scenario: MacroStressScenario,
  baseScenarioInput: ScenarioInput,
  correlationPenalty: CorrelationPenalty | null = null
): MacroStressScenarioResult {
  const correlationAmp = correlationPenalty?.appliedPenaltyPct ?? 0;

  const baselineRun = runUnderwritingPipeline(prepared, baseScenarioInput);
  const baselineMetrics = computeReturnMetrics({
    leaseDcf: baselineRun.leaseDcf,
    debtSchedule: baselineRun.debtSchedule,
    equityWaterfall: baselineRun.equityWaterfall,
    totalCapexKrw: prepared.capexBreakdown.totalCapexKrw
  });

  const shockedPrepared = applyShocks(prepared, scenario.shocks, correlationAmp);
  const stressedRun = runUnderwritingPipeline(shockedPrepared, baseScenarioInput);
  const stressedMetrics = computeReturnMetrics({
    leaseDcf: stressedRun.leaseDcf,
    debtSchedule: stressedRun.debtSchedule,
    equityWaterfall: stressedRun.equityWaterfall,
    totalCapexKrw: shockedPrepared.capexBreakdown.totalCapexKrw
  });

  const equityIrrDeltaPct =
    baselineMetrics.equityIrr !== null && stressedMetrics.equityIrr !== null
      ? Number((stressedMetrics.equityIrr - baselineMetrics.equityIrr).toFixed(2))
      : null;
  const equityMultipleDelta = Number(
    (stressedMetrics.equityMultiple - baselineMetrics.equityMultiple).toFixed(2)
  );
  const paybackShiftYears =
    baselineMetrics.paybackYear !== null && stressedMetrics.paybackYear !== null
      ? stressedMetrics.paybackYear - baselineMetrics.paybackYear
      : null;

  const dscrStats = computeDscrStats(stressedRun.debtSchedule.years.map((y) => y.dscr));
  const verdict = verdictFromMetrics(equityIrrDeltaPct, dscrStats.worst);
  const commentary = buildCommentary(
    scenario.name,
    verdict,
    equityIrrDeltaPct,
    dscrStats.worst,
    correlationAmp
  );
  const lineItemImpacts = buildLineItemImpacts(
    baselineRun.leaseDcf,
    stressedRun.leaseDcf,
    baselineRun.debtSchedule,
    stressedRun.debtSchedule
  );

  return {
    scenarioName: scenario.name,
    description: scenario.description,
    shocks: scenario.shocks,
    baseline: baselineMetrics,
    stressed: stressedMetrics,
    equityIrrDeltaPct,
    equityMultipleDelta,
    paybackShiftYears,
    stressedEndingDebtKrw: stressedRun.debtSchedule.endingDebtBalanceKrw,
    stressedAverageDscr: dscrStats.average,
    worstDscr: dscrStats.worst,
    verdict,
    commentary,
    lineItemImpacts,
    correlationPenaltyApplied:
      correlationPenalty && correlationPenalty.appliedPenaltyPct > 0 ? correlationPenalty : null
  };
}

// ---------------------------------------------------------------------------
// Analysis: run a set of scenarios
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Factor-level attribution: which macro factor drives which line item impact
// ---------------------------------------------------------------------------

const FACTOR_LABELS: Record<keyof MacroStressScenario['shocks'], string> = {
  rateShiftBps: 'Rate',
  spreadShiftBps: 'Credit Spread',
  vacancyShiftPct: 'Vacancy',
  growthShiftPct: 'Growth',
  constructionCostShiftPct: 'Construction Cost'
};

function isolateFactorShocks(
  full: MacroStressScenario['shocks'],
  factor: keyof MacroStressScenario['shocks']
): MacroStressScenario['shocks'] {
  return {
    rateShiftBps: factor === 'rateShiftBps' ? full.rateShiftBps : 0,
    spreadShiftBps: factor === 'spreadShiftBps' ? full.spreadShiftBps : 0,
    vacancyShiftPct: factor === 'vacancyShiftPct' ? full.vacancyShiftPct : 0,
    growthShiftPct: factor === 'growthShiftPct' ? full.growthShiftPct : 0,
    constructionCostShiftPct:
      factor === 'constructionCostShiftPct' ? full.constructionCostShiftPct : 0
  };
}

export function runFactorAttribution(
  prepared: PreparedUnderwritingInputs,
  scenario: MacroStressScenario
): MacroFactorAttributionResult {
  const baseScenarioInput =
    dataCenterScenarioInputs.find((s) => s.name === 'Base') ?? dataCenterScenarioInputs[0]!;

  const baselineRun = runUnderwritingPipeline(prepared, baseScenarioInput);
  const baselineMetrics = computeReturnMetrics({
    leaseDcf: baselineRun.leaseDcf,
    debtSchedule: baselineRun.debtSchedule,
    equityWaterfall: baselineRun.equityWaterfall,
    totalCapexKrw: prepared.capexBreakdown.totalCapexKrw
  });

  const fullStressedPrepared = applyShocks(prepared, scenario.shocks, 0);
  const fullStressedRun = runUnderwritingPipeline(fullStressedPrepared, baseScenarioInput);
  const fullStressedMetrics = computeReturnMetrics({
    leaseDcf: fullStressedRun.leaseDcf,
    debtSchedule: fullStressedRun.debtSchedule,
    equityWaterfall: fullStressedRun.equityWaterfall,
    totalCapexKrw: fullStressedPrepared.capexBreakdown.totalCapexKrw
  });

  const totalIrrDeltaPct =
    baselineMetrics.equityIrr !== null && fullStressedMetrics.equityIrr !== null
      ? Number((fullStressedMetrics.equityIrr - baselineMetrics.equityIrr).toFixed(2))
      : null;
  const totalMultipleDelta = Number(
    (fullStressedMetrics.equityMultiple - baselineMetrics.equityMultiple).toFixed(2)
  );

  const factorKeys: Array<keyof MacroStressScenario['shocks']> = [
    'rateShiftBps',
    'spreadShiftBps',
    'vacancyShiftPct',
    'growthShiftPct',
    'constructionCostShiftPct'
  ];

  const rawAttributions = factorKeys.map((factor) => {
    const isolated = isolateFactorShocks(scenario.shocks, factor);
    const shocked = applyShocks(prepared, isolated, 0);
    const run = runUnderwritingPipeline(shocked, baseScenarioInput);
    const metrics = computeReturnMetrics({
      leaseDcf: run.leaseDcf,
      debtSchedule: run.debtSchedule,
      equityWaterfall: run.equityWaterfall,
      totalCapexKrw: shocked.capexBreakdown.totalCapexKrw
    });

    const irrDelta =
      baselineMetrics.equityIrr !== null && metrics.equityIrr !== null
        ? Number((metrics.equityIrr - baselineMetrics.equityIrr).toFixed(2))
        : null;
    const multipleDelta = Number(
      (metrics.equityMultiple - baselineMetrics.equityMultiple).toFixed(2)
    );
    const lineItems = buildLineItemImpacts(
      baselineRun.leaseDcf,
      run.leaseDcf,
      baselineRun.debtSchedule,
      run.debtSchedule
    );

    return { factor, irrDelta, multipleDelta, lineItems };
  });

  const totalAbsIrrDelta = rawAttributions.reduce((sum, a) => sum + Math.abs(a.irrDelta ?? 0), 0);

  const factors: MacroFactorAttribution[] = rawAttributions.map((a) => ({
    factor: a.factor,
    factorLabel: FACTOR_LABELS[a.factor],
    isolatedIrrDeltaPct: a.irrDelta,
    isolatedMultipleDelta: a.multipleDelta,
    lineItemImpacts: a.lineItems,
    contributionShareOfTotalDelta:
      totalAbsIrrDelta > 0
        ? Number(((Math.abs(a.irrDelta ?? 0) / totalAbsIrrDelta) * 100).toFixed(1))
        : 0
  }));

  return {
    scenarioName: scenario.name,
    totalIrrDeltaPct,
    totalMultipleDelta,
    factors
  };
}

export function runMacroStressAnalysis(
  prepared: PreparedUnderwritingInputs,
  scenarios: MacroStressScenario[],
  correlationPenalty: CorrelationPenalty | null = null
): MacroStressAnalysis {
  const baseScenarioInput =
    dataCenterScenarioInputs.find((s) => s.name === 'Base') ?? dataCenterScenarioInputs[0]!;

  const baselineRun = runUnderwritingPipeline(prepared, baseScenarioInput);
  const baseline = computeReturnMetrics({
    leaseDcf: baselineRun.leaseDcf,
    debtSchedule: baselineRun.debtSchedule,
    equityWaterfall: baselineRun.equityWaterfall,
    totalCapexKrw: prepared.capexBreakdown.totalCapexKrw
  });

  const results = scenarios.map((scenario) =>
    runMacroProFormaStress(prepared, scenario, baseScenarioInput, correlationPenalty)
  );

  return {
    baseline,
    scenarios: results
  };
}
