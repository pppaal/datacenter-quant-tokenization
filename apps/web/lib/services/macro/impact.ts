import type { MacroSensitivityProfile, MacroFactorSnapshot } from '@/lib/services/macro/factors';

export type MacroImpactDirection = 'TAILWIND' | 'HEADWIND' | 'NEUTRAL';

export type MacroImpactDimension = {
  key:
    | 'pricing'
    | 'leasing'
    | 'financing'
    | 'construction'
    | 'refinancing'
    | 'allocation';
  label: string;
  score: number;
  direction: MacroImpactDirection;
  commentary: string;
  channels: string[];
};

export type MacroTransmissionPath = {
  factorKey: string;
  factorLabel: string;
  targetKey: MacroImpactDimension['key'];
  targetLabel: string;
  direction: MacroImpactDirection;
  strength: number;
  rationale: string;
};

export type MacroImpactMatrix = {
  dimensions: MacroImpactDimension[];
  paths: MacroTransmissionPath[];
  summary: string[];
};

type BuildMacroImpactMatrixInput = {
  assetClass: string;
  profile: MacroSensitivityProfile;
  factors: MacroFactorSnapshot['factors'];
  regimes: {
    capitalMarkets: { state: string };
    leasing: { state: string };
    construction: { state: string };
    refinance: { state: string };
  };
  guidance: {
    discountRateShiftPct: number;
    exitCapRateShiftPct: number;
    debtCostShiftPct: number;
    occupancyShiftPct: number;
    growthShiftPct: number;
    replacementCostShiftPct: number;
  };
};

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function factorWeight(direction: string) {
  if (direction === 'POSITIVE') return 1;
  if (direction === 'NEGATIVE') return -1;
  return 0;
}

function resolveDirection(score: number): MacroImpactDirection {
  if (score >= 0.4) return 'TAILWIND';
  if (score <= -0.4) return 'HEADWIND';
  return 'NEUTRAL';
}

function findFactor(factors: MacroFactorSnapshot['factors'], key: string) {
  return factors.find((factor) => factor.key === key) ?? null;
}

function buildPath(
  factor: MacroFactorSnapshot['factors'][number] | null,
  targetKey: MacroImpactDimension['key'],
  targetLabel: string,
  multiplier: number,
  rationale: string
): MacroTransmissionPath | null {
  if (!factor) return null;
  const weighted = factorWeight(factor.direction) * multiplier;
  return {
    factorKey: factor.key,
    factorLabel: factor.label,
    targetKey,
    targetLabel,
    direction: resolveDirection(weighted),
    strength: round(Math.abs(weighted)),
    rationale
  };
}

export function buildMacroImpactMatrix(input: BuildMacroImpactMatrixInput): MacroImpactMatrix {
  const rateLevel = findFactor(input.factors, 'rate_level');
  const rateMomentum = findFactor(input.factors, 'rate_momentum_bps');
  const creditStress = findFactor(input.factors, 'credit_stress');
  const liquidity = findFactor(input.factors, 'liquidity');
  const growth = findFactor(input.factors, 'growth_momentum');
  const construction = findFactor(input.factors, 'construction_pressure');
  const propertyDemand = findFactor(input.factors, 'property_demand');
  const inflation = findFactor(input.factors, 'inflation_trend');

  const pricingScore =
    -(input.guidance.discountRateShiftPct * 0.8 + input.guidance.exitCapRateShiftPct * 1.1) +
    factorWeight(liquidity?.direction ?? 'NEUTRAL') * 0.6 * input.profile.liquiditySensitivity;
  const leasingScore =
    (input.guidance.occupancyShiftPct / 4) +
    (input.guidance.growthShiftPct * 1.5) +
    factorWeight(propertyDemand?.direction ?? 'NEUTRAL') * 0.9 * input.profile.leasingSensitivity;
  const financingScore =
    -(input.guidance.debtCostShiftPct * 2) -
    (-factorWeight(rateLevel?.direction ?? 'NEUTRAL') * 0.8 * input.profile.capitalRateSensitivity) +
    (factorWeight(creditStress?.direction ?? 'NEUTRAL') * 0.9 * input.profile.capitalRateSensitivity);
  const constructionScore =
    -(input.guidance.replacementCostShiftPct / 6) -
    (-factorWeight(construction?.direction ?? 'NEUTRAL') * 0.8 * input.profile.constructionSensitivity);
  const refinancingScore =
    (input.regimes.refinance.state === 'LOW' ? 0.8 : input.regimes.refinance.state === 'HIGH' ? -1 : -0.3) +
    factorWeight(liquidity?.direction ?? 'NEUTRAL') * 0.6 * input.profile.liquiditySensitivity +
    factorWeight(creditStress?.direction ?? 'NEUTRAL') * 0.7 * input.profile.capitalRateSensitivity;
  const allocationScore =
    factorWeight(propertyDemand?.direction ?? 'NEUTRAL') * 0.8 +
    factorWeight(inflation?.direction ?? 'NEUTRAL') * 0.3 +
    factorWeight(growth?.direction ?? 'NEUTRAL') * 0.5;

  const dimensions: MacroImpactDimension[] = [
    {
      key: 'pricing',
      label: 'Entry and Exit Pricing',
      score: round(pricingScore),
      direction: resolveDirection(pricingScore),
      commentary:
        pricingScore <= -0.4
          ? 'Macro conditions pressure entry and exit pricing through discount-rate and exit-cap widening.'
          : pricingScore >= 0.4
            ? 'Macro conditions support tighter pricing and better exit liquidity.'
            : 'Pricing impact is mixed and near neutral.',
      channels: [
        'discount rate shift',
        'exit cap shift',
        'market liquidity'
      ]
    },
    {
      key: 'leasing',
      label: 'Leasing and Revenue',
      score: round(leasingScore),
      direction: resolveDirection(leasingScore),
      commentary:
        leasingScore <= -0.4
          ? 'Demand and growth factors weaken occupancy and top-line assumptions.'
          : leasingScore >= 0.4
            ? 'Demand factors support occupancy and revenue growth.'
            : 'Leasing impact is balanced.',
      channels: ['occupancy shift', 'growth shift', 'property demand']
    },
    {
      key: 'financing',
      label: 'Financing Cost',
      score: round(financingScore),
      direction: resolveDirection(financingScore),
      commentary:
        financingScore <= -0.4
          ? 'Rate and credit factors raise the financing burden.'
          : financingScore >= 0.4
            ? 'Rates and spreads support cheaper financing.'
            : 'Financing impact is moderate.',
      channels: ['debt cost shift', 'rate level', 'credit stress']
    },
    {
      key: 'construction',
      label: 'Construction and Replacement Cost',
      score: round(constructionScore),
      direction: resolveDirection(constructionScore),
      commentary:
        constructionScore <= -0.4
          ? 'Construction pressure raises replacement cost and contingency.'
          : constructionScore >= 0.4
            ? 'Construction conditions are supportive for cost control.'
            : 'Construction impact is manageable.',
      channels: ['replacement cost shift', 'construction pressure']
    },
    {
      key: 'refinancing',
      label: 'Refinancing and Exit Liquidity',
      score: round(refinancingScore),
      direction: resolveDirection(refinancingScore),
      commentary:
        refinancingScore <= -0.4
          ? 'Liquidity and credit conditions make refinancing and exit execution harder.'
          : refinancingScore >= 0.4
            ? 'Liquidity conditions support refinancing flexibility.'
            : 'Refinancing conditions are workable but not easy.',
      channels: ['refinance regime', 'liquidity', 'credit stress']
    },
    {
      key: 'allocation',
      label: 'Cross-Asset Allocation',
      score: round(allocationScore),
      direction: resolveDirection(allocationScore),
      commentary:
        allocationScore <= -0.4
          ? 'Macro factors reduce relative attractiveness versus other assets.'
          : allocationScore >= 0.4
            ? 'Macro factors improve relative attractiveness versus other assets.'
            : 'Cross-asset allocation impact is neutral.',
      channels: ['property demand', 'inflation trend', 'growth momentum']
    }
  ];

  const paths = [
    buildPath(rateLevel, 'pricing', 'Entry and Exit Pricing', input.profile.capitalRateSensitivity, 'Higher rate levels reprice valuation multiples.'),
    buildPath(rateMomentum, 'financing', 'Financing Cost', input.profile.capitalRateSensitivity, 'Rate momentum transmits into debt pricing and hedge cost.'),
    buildPath(creditStress, 'refinancing', 'Refinancing and Exit Liquidity', input.profile.capitalRateSensitivity, 'Credit stress narrows lender appetite and refinance flexibility.'),
    buildPath(liquidity, 'pricing', 'Entry and Exit Pricing', input.profile.liquiditySensitivity, 'Liquidity shifts move bid depth and exit certainty.'),
    buildPath(propertyDemand, 'leasing', 'Leasing and Revenue', input.profile.leasingSensitivity, 'Demand strength transmits into occupancy and rent capture.'),
    buildPath(construction, 'construction', 'Construction and Replacement Cost', input.profile.constructionSensitivity, 'Construction pressure changes capex and replacement-cost assumptions.'),
    buildPath(inflation, 'allocation', 'Cross-Asset Allocation', 0.8, 'Inflation shifts change the relative case for real assets.'),
    buildPath(growth, 'allocation', 'Cross-Asset Allocation', 0.9, 'Growth momentum changes cross-asset relative attractiveness.')
  ].filter((path): path is MacroTransmissionPath => path !== null);

  const strongestHeadwind = [...dimensions]
    .sort((left, right) => left.score - right.score)
    .find((dimension) => dimension.direction === 'HEADWIND');
  const strongestTailwind = [...dimensions]
    .sort((left, right) => right.score - left.score)
    .find((dimension) => dimension.direction === 'TAILWIND');

  const summary = [
    strongestHeadwind
      ? `Largest headwind: ${strongestHeadwind.label} (${strongestHeadwind.score}).`
      : 'No material macro headwind detected.',
    strongestTailwind
      ? `Largest tailwind: ${strongestTailwind.label} (${strongestTailwind.score}).`
      : 'No material macro tailwind detected.'
  ];

  return {
    dimensions,
    paths,
    summary
  };
}
