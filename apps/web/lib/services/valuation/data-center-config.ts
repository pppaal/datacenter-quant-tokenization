import type { ScenarioInput } from '@/lib/services/valuation/types';

export const dataCenterScenarioInputs: ScenarioInput[] = [
  {
    name: 'Bull',
    scenarioOrder: 0,
    note: 'Comparable pricing tightens and lease-up closes faster than the base committee plan.',
    revenueFactor: 1.08,
    capRateShiftPct: -0.35,
    discountRateShiftPct: -0.45,
    costFactor: 0.97,
    floorFactor: 1.08,
    leaseProbabilityBumpPct: 6,
    debtSpreadBumpPct: -0.1
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    note: 'Base institutional case using calibrated comps, lease underwriting, tax leakage, and project finance sizing.',
    revenueFactor: 1,
    capRateShiftPct: 0,
    discountRateShiftPct: 0,
    costFactor: 1,
    floorFactor: 1,
    leaseProbabilityBumpPct: 0,
    debtSpreadBumpPct: 0
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    note: 'Delayed utility approvals, softer pricing, and wider debt spreads pressure exit value and coverage.',
    revenueFactor: 0.91,
    capRateShiftPct: 0.7,
    discountRateShiftPct: 0.65,
    costFactor: 1.08,
    floorFactor: 0.92,
    leaseProbabilityBumpPct: -9,
    debtSpreadBumpPct: 0.45
  }
];
