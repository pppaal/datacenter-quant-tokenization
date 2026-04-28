import type {
  CostApproachResult,
  PreparedUnderwritingInputs,
  ScenarioInput
} from '@/lib/services/valuation/types';
import { riskFloorRatio } from '@/lib/services/valuation/utils';

export function computeCostApproach(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput
): CostApproachResult {
  const {
    capexBreakdown,
    comparableCalibration,
    stage,
    stageFactor,
    permitPenalty,
    floodPenalty,
    wildfirePenalty,
    locationPremium
  } = prepared;

  const replacementCostKrw = capexBreakdown.totalCapexKrw * scenario.costFactor;
  const retainedHardCostKrw = capexBreakdown.hardCostKrw * Math.max(stageFactor, 0.28) * 0.92;
  const retainedSoftCostKrw = capexBreakdown.softCostKrw * (0.45 + stageFactor * 0.2);
  const retainedContingencyKrw = capexBreakdown.contingencyKrw * 0.4 * scenario.floorFactor;

  const replacementCostFloorKrw = Math.max(
    (capexBreakdown.landValueKrw +
      retainedHardCostKrw +
      retainedSoftCostKrw +
      retainedContingencyKrw) *
      permitPenalty *
      floodPenalty *
      wildfirePenalty,
    replacementCostKrw * riskFloorRatio(stage, scenario.floorFactor)
  );

  const directComparableValueKrw = comparableCalibration.directComparableValueKrw
    ? comparableCalibration.directComparableValueKrw *
      stageFactor *
      permitPenalty *
      floodPenalty *
      wildfirePenalty *
      locationPremium
    : null;

  return {
    replacementCostKrw,
    replacementCostFloorKrw,
    directComparableValueKrw
  };
}
