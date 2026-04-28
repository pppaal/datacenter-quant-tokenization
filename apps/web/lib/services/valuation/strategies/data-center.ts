import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { dataCenterScenarioInputs } from '@/lib/services/valuation/data-center-config';
import {
  buildDataCenterAssumptions,
  buildDataCenterConfidenceScore,
  buildDataCenterDdChecklist,
  buildDataCenterKeyRisks,
  buildDataCenterProvenance,
  type DataCenterScenarioEvaluation
} from '@/lib/services/valuation/data-center-sections';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { computeCostApproach } from '@/lib/services/valuation/cost-approach';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import { prepareValuationInputs } from '@/lib/services/valuation/inputs';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import { buildDebtSchedule } from '@/lib/services/valuation/project-finance';
import {
  buildScenarioOutput,
  pickBaseScenario,
  sortScenariosByOrder
} from '@/lib/services/valuation/scenario-utils';
import type {
  PreparedUnderwritingInputs,
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { roundKrw, safeDivide } from '@/lib/services/valuation/utils';

export type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario
} from '@/lib/services/valuation/types';

function buildScenarioValue(evaluation: DataCenterScenarioEvaluation) {
  const approachValues = [
    {
      label: 'replacementFloor',
      value: evaluation.costApproach.replacementCostFloorKrw,
      weight: 0.2
    },
    {
      label: 'incomeApproach',
      value: evaluation.leaseDcf.incomeApproachValueKrw,
      weight: 0.2
    },
    {
      label: 'leaseDcf',
      value: evaluation.leaseDcf.leaseDrivenValueKrw,
      weight: 0.25
    },
    {
      label: 'comparables',
      value: evaluation.costApproach.directComparableValueKrw,
      weight: evaluation.costApproach.directComparableValueKrw ? 0.2 : 0
    },
    {
      label: 'equityBridge',
      value: evaluation.equityWaterfall.enterpriseEquivalentValueKrw,
      weight: 0.15
    }
  ].filter((entry) => Number.isFinite(entry.value) && entry.value && entry.weight > 0) as Array<{
    label: string;
    value: number;
    weight: number;
  }>;

  const totalWeight = approachValues.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedValueKrw = approachValues.reduce(
    (sum, entry) => sum + entry.value * (entry.weight / totalWeight),
    0
  );

  return {
    weightedValueKrw: Math.max(weightedValueKrw, evaluation.costApproach.replacementCostFloorKrw),
    approaches: Object.fromEntries(
      approachValues.map((entry) => [entry.label, roundKrw(entry.value)])
    )
  };
}

function evaluateScenario(
  prepared: PreparedUnderwritingInputs,
  scenarioInput: (typeof dataCenterScenarioInputs)[number]
): DataCenterScenarioEvaluation {
  const costApproach = computeCostApproach(prepared, scenarioInput);
  const leaseDcf = computeLeaseDcf(prepared, scenarioInput);
  const debtSchedule = buildDebtSchedule(
    prepared,
    scenarioInput,
    leaseDcf.years.map((year) => year.cfadsBeforeDebtKrw)
  );
  const equityWaterfall = computeEquityWaterfall(
    prepared,
    scenarioInput,
    costApproach,
    leaseDcf,
    debtSchedule
  );
  const { weightedValueKrw } = buildScenarioValue({
    scenario: {
      name: scenarioInput.name,
      valuationKrw: 0,
      impliedYieldPct: 0,
      exitCapRatePct: 0,
      debtServiceCoverage: 0,
      notes: scenarioInput.note,
      scenarioOrder: scenarioInput.scenarioOrder
    },
    weightedValueKrw: 0,
    costApproach,
    leaseDcf,
    debtSchedule,
    equityWaterfall
  });
  const stabilizedNoiKrw = leaseDcf.stabilizedNoiKrw;
  const impliedYieldPct = safeDivide(stabilizedNoiKrw, weightedValueKrw, 0) * 100;
  const averageDscr =
    debtSchedule.years
      .map((year) => year.dscr)
      .filter((value): value is number => typeof value === 'number')
      .reduce((sum, value, _, source) => sum + value / source.length, 0) || 0;

  return {
    scenario: buildScenarioOutput({
      name: scenarioInput.name,
      valuationKrw: weightedValueKrw,
      impliedYieldPct,
      exitCapRatePct: prepared.baseCapRatePct + scenarioInput.capRateShiftPct,
      debtServiceCoverage: Math.max(averageDscr, 0.75),
      notes: scenarioInput.note,
      scenarioOrder: scenarioInput.scenarioOrder
    }),
    weightedValueKrw,
    costApproach,
    leaseDcf,
    debtSchedule,
    equityWaterfall
  };
}

export async function buildDataCenterValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const prepared = prepareValuationInputs(bundle, context);
  const evaluations = dataCenterScenarioInputs.map((input) => evaluateScenario(prepared, input));
  const scenarios = sortScenariosByOrder(evaluations.map((evaluation) => evaluation.scenario));
  const baseScenarioRef = pickBaseScenario(scenarios);
  const baseScenario =
    evaluations.find((evaluation) => evaluation.scenario.name === baseScenarioRef?.name) ??
    evaluations[0];

  const analysis: UnderwritingAnalysis = {
    asset: {
      name: bundle.asset.name,
      assetCode: bundle.asset.assetCode,
      assetClass: bundle.asset.assetClass,
      stage: bundle.asset.stage,
      market: bundle.asset.market
    },
    baseCaseValueKrw: roundKrw(baseScenario.weightedValueKrw),
    confidenceScore: buildDataCenterConfidenceScore(prepared),
    underwritingMemo: '',
    keyRisks: buildDataCenterKeyRisks(prepared, baseScenario),
    ddChecklist: buildDataCenterDdChecklist(prepared),
    assumptions: buildDataCenterAssumptions(
      prepared,
      evaluations,
      (evaluation) => buildScenarioValue(evaluation).approaches
    ),
    provenance: buildDataCenterProvenance(prepared),
    scenarios: sortScenariosByOrder(scenarios)
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
