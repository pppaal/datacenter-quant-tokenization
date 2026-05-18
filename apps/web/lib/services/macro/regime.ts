import { AssetClass, type MacroSeries, type MarketSnapshot } from '@prisma/client';
import {
  buildMacroFactorSnapshot,
  getMacroFactorValue,
  type MacroFactorSnapshot,
  type MacroSensitivityProfile
} from '@/lib/services/macro/factors';
import { buildMacroImpactMatrix, type MacroImpactMatrix } from '@/lib/services/macro/impact';
import { buildMacroSnapshot, type MacroRegimeSnapshot } from '@/lib/services/macro/series';
import {
  type MacroProfileRuntimeRules,
  macroSensitivityTemplateRegistry,
  countryProfileRegistry,
  submarketProfileRegistry
} from '@/lib/services/macro/profile-registry';

export type RegimeState =
  | 'SUPPORTIVE'
  | 'NEUTRAL'
  | 'TIGHT'
  | 'STRONG'
  | 'BALANCED'
  | 'SOFT'
  | 'CONTAINED'
  | 'ELEVATED'
  | 'LOW'
  | 'MODERATE'
  | 'HIGH';

export type MacroRegimeBlock = {
  key: 'capitalMarkets' | 'leasing' | 'construction' | 'refinance';
  label: string;
  state: RegimeState;
  commentary: string;
  signals: string[];
};

export type MacroGuidance = {
  discountRateShiftPct: number;
  exitCapRateShiftPct: number;
  debtCostShiftPct: number;
  occupancyShiftPct: number;
  growthShiftPct: number;
  replacementCostShiftPct: number;
  summary: string[];
};

export type MacroInterpretation = MacroRegimeSnapshot & {
  assetClass: string;
  profile: MacroSensitivityProfile;
  factors: MacroFactorSnapshot['factors'];
  impacts: MacroImpactMatrix;
  regimes: {
    capitalMarkets: MacroRegimeBlock;
    leasing: MacroRegimeBlock;
    construction: MacroRegimeBlock;
    refinance: MacroRegimeBlock;
  };
  guidance: MacroGuidance;
};

type BuildMacroRegimeAnalysisInput = {
  assetClass: AssetClass;
  market: string;
  country?: string | null;
  submarket?: string | null;
  marketSnapshot?: MarketSnapshot | null;
  series?: MacroSeries[];
  profileRules?: MacroProfileRuntimeRules;
};

function roundPct(value: number) {
  return Number(value.toFixed(2));
}

function formatShift(value: number, unit: string) {
  if (value === 0) return `0${unit}`;
  return `${value > 0 ? '+' : ''}${roundPct(value)}${unit}`;
}

function buildSnapshot(input: BuildMacroRegimeAnalysisInput) {
  return buildMacroSnapshot(input);
}

function getSeriesValue(snapshot: MacroRegimeSnapshot, seriesKey: string) {
  return snapshot.series.find((point) => point.seriesKey === seriesKey)?.value ?? null;
}

function getVacancyThresholds(assetClass: AssetClass) {
  switch (assetClass) {
    case AssetClass.OFFICE:
      return { strong: 5, soft: 10 };
    case AssetClass.INDUSTRIAL:
      return { strong: 4, soft: 9 };
    case AssetClass.RETAIL:
      return { strong: 5, soft: 12 };
    case AssetClass.MULTIFAMILY:
      return { strong: 3.5, soft: 7 };
    case AssetClass.DATA_CENTER:
      return { strong: 6, soft: 12 };
    default:
      return { strong: 5, soft: 10 };
  }
}

function roundSensitivity(value: number) {
  return Number(Math.min(Math.max(value, 0.75), 1.6).toFixed(2));
}

function normalizeCountry(country?: string | null) {
  return country?.trim().toUpperCase() ?? null;
}

function normalizeSubmarket(submarket?: string | null) {
  return submarket?.trim().toLowerCase() ?? null;
}

function getBaseMacroSensitivityProfile(
  assetClass: AssetClass,
  market: string,
  country?: string | null,
  submarket?: string | null
): MacroSensitivityProfile {
  const template = macroSensitivityTemplateRegistry[assetClass] ?? {
    label: 'Balanced generic real-asset profile',
    capitalRateSensitivity: 1,
    liquiditySensitivity: 1,
    leasingSensitivity: 1,
    constructionSensitivity: 1
  };

  return {
    assetClass,
    market,
    country: normalizeCountry(country),
    submarket: normalizeSubmarket(submarket),
    label: template.label,
    adjustmentSummary: [],
    capitalRateSensitivity: template.capitalRateSensitivity,
    liquiditySensitivity: template.liquiditySensitivity,
    leasingSensitivity: template.leasingSensitivity,
    constructionSensitivity: template.constructionSensitivity
  };
}

function getMacroSensitivityProfile(
  assetClass: AssetClass,
  market: string,
  country?: string | null,
  submarket?: string | null,
  profileRules?: MacroProfileRuntimeRules
): MacroSensitivityProfile {
  const normalizedCountry = normalizeCountry(country);
  const normalizedSubmarket = normalizeSubmarket(submarket);
  const profile = getBaseMacroSensitivityProfile(
    assetClass,
    market,
    normalizedCountry,
    submarket ?? null
  );

  const countryRules = (profileRules?.countryRules ?? countryProfileRegistry).filter(
    (rule) =>
      rule.country === normalizedCountry && (!rule.assetClass || rule.assetClass === assetClass)
  );
  for (const rule of countryRules) {
    applyProfileModifier(profile, rule.label, rule.modifiers);
  }

  if (normalizedSubmarket) {
    for (const rule of profileRules?.submarketRules ?? submarketProfileRegistry) {
      if (rule.country && rule.country !== normalizedCountry) continue;
      if (rule.assetClass && rule.assetClass !== assetClass) continue;
      if (!rule.pattern.test(normalizedSubmarket)) continue;
      applyProfileModifier(profile, rule.label, rule.modifiers);
    }
  }

  if (profile.adjustmentSummary.length > 0) {
    profile.label = `${profile.label} / ${profile.adjustmentSummary.join(' / ')}`;
  }

  return profile;
}

/* legacy implementation retained below removed in favor of registry templates */
function applyProfileModifier(
  profile: MacroSensitivityProfile,
  label: string,
  modifiers: Partial<
    Pick<
      MacroSensitivityProfile,
      | 'capitalRateSensitivity'
      | 'liquiditySensitivity'
      | 'leasingSensitivity'
      | 'constructionSensitivity'
    >
  >
) {
  if (modifiers.capitalRateSensitivity) {
    profile.capitalRateSensitivity = roundSensitivity(
      profile.capitalRateSensitivity * modifiers.capitalRateSensitivity
    );
  }
  if (modifiers.liquiditySensitivity) {
    profile.liquiditySensitivity = roundSensitivity(
      profile.liquiditySensitivity * modifiers.liquiditySensitivity
    );
  }
  if (modifiers.leasingSensitivity) {
    profile.leasingSensitivity = roundSensitivity(
      profile.leasingSensitivity * modifiers.leasingSensitivity
    );
  }
  if (modifiers.constructionSensitivity) {
    profile.constructionSensitivity = roundSensitivity(
      profile.constructionSensitivity * modifiers.constructionSensitivity
    );
  }
  profile.adjustmentSummary.push(label);
}

function buildCapitalMarketsBlock(
  assetClass: AssetClass,
  profile: MacroSensitivityProfile,
  debtCostPct: number | null,
  discountRatePct: number | null,
  policyRatePct: number | null,
  creditStressScore: number | null,
  rateLevelScore: number | null,
  rateMomentumBps: number | null
): MacroRegimeBlock {
  const signals = [
    debtCostPct != null ? `Debt cost ${roundPct(debtCostPct)}%` : 'Debt cost unavailable',
    discountRatePct != null
      ? `Discount rate ${roundPct(discountRatePct)}%`
      : 'Discount rate unavailable',
    policyRatePct != null ? `Policy rate ${roundPct(policyRatePct)}%` : 'Policy rate unavailable',
    creditStressScore != null
      ? `Credit stress ${roundPct(creditStressScore)} bps`
      : 'Credit stress unavailable',
    rateLevelScore != null ? `Rate level ${roundPct(rateLevelScore)}%` : 'Rate level unavailable',
    rateMomentumBps != null
      ? `Rate momentum ${roundPct(rateMomentumBps)} bps`
      : 'Rate momentum unavailable',
    `Asset beta ${roundPct(profile.capitalRateSensitivity)}x`
  ];
  const adjustedDebtCost =
    (rateLevelScore ?? debtCostPct) != null
      ? (rateLevelScore ?? debtCostPct ?? 0) * profile.capitalRateSensitivity
      : null;
  const adjustedDiscountRate =
    (discountRatePct ?? rateLevelScore) != null
      ? (discountRatePct ?? rateLevelScore ?? 0) * profile.capitalRateSensitivity
      : null;
  const adjustedPolicyRate =
    policyRatePct != null ? policyRatePct * profile.capitalRateSensitivity : null;
  const adjustedCreditSpread =
    creditStressScore != null ? creditStressScore * profile.capitalRateSensitivity : null;
  const adjustedRateMomentum =
    rateMomentumBps != null ? rateMomentumBps * profile.capitalRateSensitivity : null;

  if (
    (adjustedDebtCost ?? 0) >= 6 ||
    (adjustedDiscountRate ?? 0) >= 9 ||
    (adjustedPolicyRate ?? 0) >= 4 ||
    (adjustedCreditSpread ?? 0) >= 220 ||
    (adjustedRateMomentum ?? 0) >= 25
  ) {
    return {
      key: 'capitalMarkets',
      label: 'Capital Markets',
      state: 'TIGHT',
      commentary:
        profile.capitalRateSensitivity > 1
          ? 'Funding markets are expensive for this asset class, so underwriting should assume wider pricing and lower leverage tolerance.'
          : 'Funding markets are expensive and the underwriting should assume wider pricing and lower leverage tolerance.',
      signals
    };
  }

  if (
    (adjustedDebtCost ?? Number.POSITIVE_INFINITY) <= 4.5 &&
    (adjustedDiscountRate ?? Number.POSITIVE_INFINITY) <= 7.25 &&
    (adjustedPolicyRate ?? Number.POSITIVE_INFINITY) <= 3.5 &&
    (adjustedCreditSpread ?? Number.POSITIVE_INFINITY) <= 150
  ) {
    return {
      key: 'capitalMarkets',
      label: 'Capital Markets',
      state: 'SUPPORTIVE',
      commentary:
        'Funding conditions are comparatively supportive and allow a tighter exit and discount-rate posture.',
      signals
    };
  }

  return {
    key: 'capitalMarkets',
    label: 'Capital Markets',
    state: 'NEUTRAL',
    commentary:
      'Capital markets are open but not especially forgiving, so the model should stay close to prevailing pricing.',
    signals
  };
}

function buildLeasingBlock(
  assetClass: AssetClass,
  profile: MacroSensitivityProfile,
  vacancyPct: number | null,
  rentGrowthPct: number | null,
  transactionVolumeIndex: number | null,
  propertyDemandScore: number | null,
  liquidityScore: number | null
): MacroRegimeBlock {
  const thresholds = getVacancyThresholds(assetClass);
  const signals = [
    vacancyPct != null ? `Vacancy ${roundPct(vacancyPct)}%` : 'Vacancy unavailable',
    rentGrowthPct != null ? `Rent growth ${roundPct(rentGrowthPct)}%` : 'Rent growth unavailable',
    transactionVolumeIndex != null
      ? `Transaction volume index ${roundPct(transactionVolumeIndex)}`
      : 'Transaction volume unavailable',
    propertyDemandScore != null
      ? `Property demand ${roundPct(propertyDemandScore)}`
      : 'Property demand unavailable',
    liquidityScore != null ? `Liquidity ${roundPct(liquidityScore)}` : 'Liquidity unavailable',
    `Leasing beta ${roundPct(profile.leasingSensitivity)}x / liquidity beta ${roundPct(profile.liquiditySensitivity)}x`
  ];
  const adjustedVacancy = vacancyPct != null ? vacancyPct * profile.leasingSensitivity : null;
  const adjustedRentGrowth =
    (propertyDemandScore != null ? propertyDemandScore / 10 : rentGrowthPct) != null
      ? (propertyDemandScore != null ? propertyDemandScore / 10 : (rentGrowthPct ?? 0)) /
        profile.leasingSensitivity
      : null;
  const adjustedTransactionVolume =
    (liquidityScore ?? transactionVolumeIndex) != null
      ? (liquidityScore ?? transactionVolumeIndex ?? 0) / profile.liquiditySensitivity
      : null;

  if (
    (adjustedVacancy ?? Number.NEGATIVE_INFINITY) >= thresholds.soft ||
    (adjustedRentGrowth ?? Number.POSITIVE_INFINITY) < 1 ||
    (adjustedTransactionVolume ?? Number.POSITIVE_INFINITY) < 85
  ) {
    return {
      key: 'leasing',
      label: 'Leasing Market',
      state: 'SOFT',
      commentary:
        profile.leasingSensitivity > 1
          ? 'Leasing conditions are weak for this asset class, so the downside case should assume slower lease-up and softer pricing.'
          : 'Vacancy is elevated for the asset class, so the downside case should assume slower lease-up and softer pricing.',
      signals
    };
  }

  if (
    (adjustedVacancy ?? Number.POSITIVE_INFINITY) <= thresholds.strong &&
    (adjustedRentGrowth ?? Number.NEGATIVE_INFINITY) >= 2.5 &&
    (adjustedTransactionVolume ?? Number.NEGATIVE_INFINITY) >= 105
  ) {
    return {
      key: 'leasing',
      label: 'Leasing Market',
      state: 'STRONG',
      commentary:
        'Vacancy is tight for the asset class, supporting a firmer occupancy base and narrower downside stress.',
      signals
    };
  }

  return {
    key: 'leasing',
    label: 'Leasing Market',
    state: 'BALANCED',
    commentary:
      'Leasing conditions look balanced, so the base case can stay close to observed occupancy and market rent.',
    signals
  };
}

function buildConstructionBlock(
  assetClass: AssetClass,
  profile: MacroSensitivityProfile,
  inflationPct: number | null,
  constructionCostIndex: number | null,
  constructionPressureScore: number | null,
  marketSnapshot?: MarketSnapshot | null
): MacroRegimeBlock {
  const constructionCost = marketSnapshot?.constructionCostPerMwKrw ?? null;
  const signals = [
    inflationPct != null ? `Inflation ${roundPct(inflationPct)}%` : 'Inflation unavailable',
    constructionCostIndex != null
      ? `Construction cost index ${roundPct(constructionCostIndex)}`
      : 'Construction cost index unavailable',
    constructionPressureScore != null
      ? `Construction pressure ${roundPct(constructionPressureScore)}`
      : 'Construction pressure unavailable',
    constructionCost != null && assetClass === AssetClass.DATA_CENTER
      ? `Replacement cost ${roundPct(constructionCost / 1_000_000_000)}bn KRW/MW`
      : 'Construction cost proxy not tracked',
    `Construction beta ${roundPct(profile.constructionSensitivity)}x`
  ];
  const adjustedInflation =
    (constructionPressureScore != null ? constructionPressureScore / 8 : inflationPct) != null
      ? (constructionPressureScore != null ? constructionPressureScore / 8 : (inflationPct ?? 0)) *
        profile.constructionSensitivity
      : null;
  const adjustedConstructionCostIndex =
    (constructionPressureScore != null ? 100 + constructionPressureScore : constructionCostIndex) !=
    null
      ? (constructionPressureScore != null
          ? 100 + constructionPressureScore
          : (constructionCostIndex ?? 0)) * profile.constructionSensitivity
      : null;
  const adjustedReplacementCost =
    assetClass === AssetClass.DATA_CENTER && constructionCost != null
      ? constructionCost * profile.constructionSensitivity
      : constructionCost;

  const highCost =
    (adjustedInflation ?? 0) >= 3.5 ||
    (adjustedConstructionCostIndex ?? 0) >= 120 ||
    (assetClass === AssetClass.DATA_CENTER &&
      adjustedReplacementCost != null &&
      adjustedReplacementCost >= 8_000_000_000);

  if (highCost) {
    return {
      key: 'construction',
      label: 'Construction Costs',
      state: 'HIGH',
      commentary:
        'Input-cost pressure is elevated, so capex and contingency assumptions should be widened.',
      signals
    };
  }

  if (
    (adjustedInflation ?? 0) >= 2.7 ||
    (adjustedConstructionCostIndex ?? 0) >= 112 ||
    (assetClass === AssetClass.DATA_CENTER &&
      adjustedReplacementCost != null &&
      adjustedReplacementCost >= 7_200_000_000)
  ) {
    return {
      key: 'construction',
      label: 'Construction Costs',
      state: 'ELEVATED',
      commentary:
        'Construction costs are not stressed but still warrant a modest contingency overlay.',
      signals
    };
  }

  return {
    key: 'construction',
    label: 'Construction Costs',
    state: 'CONTAINED',
    commentary:
      'Construction cost pressure looks manageable relative to recent underwriting baselines.',
    signals
  };
}

function buildRefinanceBlock(
  assetClass: AssetClass,
  profile: MacroSensitivityProfile,
  debtCostPct: number | null,
  capRatePct: number | null,
  creditStressScore: number | null,
  liquidityScore: number | null
): MacroRegimeBlock {
  const signals = [
    debtCostPct != null ? `Debt cost ${roundPct(debtCostPct)}%` : 'Debt cost unavailable',
    capRatePct != null ? `Cap rate ${roundPct(capRatePct)}%` : 'Cap rate unavailable',
    creditStressScore != null
      ? `Credit stress ${roundPct(creditStressScore)} bps`
      : 'Credit stress unavailable',
    liquidityScore != null ? `Liquidity ${roundPct(liquidityScore)}` : 'Liquidity unavailable',
    `Refi beta ${roundPct((profile.capitalRateSensitivity + profile.liquiditySensitivity) / 2)}x`
  ];
  const adjustedDebtCost =
    debtCostPct != null ? debtCostPct * profile.capitalRateSensitivity : null;
  const adjustedCapRate = capRatePct != null ? capRatePct * profile.capitalRateSensitivity : null;
  const adjustedCreditSpread =
    creditStressScore != null ? creditStressScore * profile.capitalRateSensitivity : null;
  const adjustedTransactionVolume =
    liquidityScore != null ? liquidityScore / profile.liquiditySensitivity : null;

  if (
    (adjustedDebtCost ?? 0) >= 6.2 ||
    (adjustedCapRate ?? 0) >= 6.75 ||
    (adjustedCreditSpread ?? 0) >= 220 ||
    (adjustedTransactionVolume ?? Number.POSITIVE_INFINITY) < 80
  ) {
    return {
      key: 'refinance',
      label: 'Refinancing',
      state: 'HIGH',
      commentary:
        'Refinancing conditions look difficult, so debt sizing and exit pricing should be stressed harder.',
      signals
    };
  }

  if (
    (adjustedDebtCost ?? 0) >= 5.25 ||
    (adjustedCapRate ?? 0) >= 5.75 ||
    (adjustedCreditSpread ?? 0) >= 170 ||
    (adjustedTransactionVolume ?? Number.POSITIVE_INFINITY) < 95
  ) {
    return {
      key: 'refinance',
      label: 'Refinancing',
      state: 'MODERATE',
      commentary:
        'Refinancing markets are workable but still require a spread and covenant cushion in the downside case.',
      signals
    };
  }

  return {
    key: 'refinance',
    label: 'Refinancing',
    state: 'LOW',
    commentary:
      'Refinancing conditions look comparatively open, so the model does not need an extra punitive spread overlay.',
    signals
  };
}

function buildGuidance(
  regimes: MacroInterpretation['regimes'],
  profile: MacroSensitivityProfile
): MacroGuidance {
  let discountRateShiftPct = 0;
  let exitCapRateShiftPct = 0;
  let debtCostShiftPct = 0;
  let occupancyShiftPct = 0;
  let growthShiftPct = 0;
  let replacementCostShiftPct = 0;
  const summary: string[] = [];

  if (regimes.capitalMarkets.state === 'TIGHT') {
    discountRateShiftPct += 0.45 * profile.capitalRateSensitivity;
    exitCapRateShiftPct += 0.2 * profile.capitalRateSensitivity;
    debtCostShiftPct += 0.35 * profile.capitalRateSensitivity;
    summary.push(
      `Capital markets are tight, so discount rate, exit cap, and debt spread are widened for this ${profile.assetClass.replaceAll('_', ' ').toLowerCase()} profile.`
    );
  } else if (regimes.capitalMarkets.state === 'SUPPORTIVE') {
    discountRateShiftPct -= 0.15 * profile.capitalRateSensitivity;
    exitCapRateShiftPct -= 0.1 * profile.capitalRateSensitivity;
    debtCostShiftPct -= 0.1 * profile.capitalRateSensitivity;
    summary.push(
      'Capital markets are supportive, so the base case can stay slightly tighter than neutral.'
    );
  }

  if (regimes.leasing.state === 'SOFT') {
    occupancyShiftPct -= 5 * profile.leasingSensitivity;
    growthShiftPct -= 0.35 * profile.leasingSensitivity;
    exitCapRateShiftPct += 0.15 * profile.liquiditySensitivity;
    summary.push(
      'Leasing conditions are soft, so occupancy and growth are cut while exit pricing is widened.'
    );
  } else if (regimes.leasing.state === 'STRONG') {
    occupancyShiftPct += 2 * profile.leasingSensitivity;
    growthShiftPct += 0.2 * profile.leasingSensitivity;
    exitCapRateShiftPct -= 0.05 * profile.liquiditySensitivity;
    summary.push(
      'Leasing conditions are strong, so the model carries a modest occupancy and growth uplift.'
    );
  }

  if (regimes.construction.state === 'HIGH') {
    replacementCostShiftPct += 8 * profile.constructionSensitivity;
    summary.push(
      'Construction cost pressure is high, so replacement cost and contingency are stepped up materially.'
    );
  } else if (regimes.construction.state === 'ELEVATED') {
    replacementCostShiftPct += 4 * profile.constructionSensitivity;
    summary.push(
      'Construction costs are elevated, so replacement cost carries a modest contingency uplift.'
    );
  }

  if (regimes.refinance.state === 'HIGH') {
    debtCostShiftPct += 0.2 * profile.capitalRateSensitivity;
    exitCapRateShiftPct += 0.1 * profile.liquiditySensitivity;
    summary.push(
      'Refinancing risk is high, so debt cost and exit cap take an additional downside cushion.'
    );
  } else if (regimes.refinance.state === 'MODERATE') {
    debtCostShiftPct += 0.1 * profile.capitalRateSensitivity;
    summary.push('Refinancing risk is moderate, so a smaller spread add-on is applied.');
  }

  if (summary.length === 0) {
    summary.push(
      'Macro conditions are close to neutral, so the underwriting stays near current market inputs.'
    );
  }

  summary.unshift(
    `Asset weighting: capital ${roundPct(profile.capitalRateSensitivity)}x, liquidity ${roundPct(profile.liquiditySensitivity)}x, leasing ${roundPct(profile.leasingSensitivity)}x, construction ${roundPct(profile.constructionSensitivity)}x.`
  );

  summary.push(
    `Overlay: discount ${formatShift(discountRateShiftPct, ' pts')}, exit cap ${formatShift(exitCapRateShiftPct, ' pts')}, debt cost ${formatShift(debtCostShiftPct, ' pts')}, occupancy ${formatShift(occupancyShiftPct, ' pts')}, growth ${formatShift(growthShiftPct, ' pts')}, replacement cost ${formatShift(replacementCostShiftPct, '%')}.`
  );

  return {
    discountRateShiftPct: roundPct(discountRateShiftPct),
    exitCapRateShiftPct: roundPct(exitCapRateShiftPct),
    debtCostShiftPct: roundPct(debtCostShiftPct),
    occupancyShiftPct: roundPct(occupancyShiftPct),
    growthShiftPct: roundPct(growthShiftPct),
    replacementCostShiftPct: roundPct(replacementCostShiftPct),
    summary
  };
}

export function buildMacroRegimeAnalysis(
  input: BuildMacroRegimeAnalysisInput
): MacroInterpretation {
  const snapshot = buildSnapshot(input);
  const submarket = input.submarket ?? input.marketSnapshot?.metroRegion ?? null;
  const profile = getMacroSensitivityProfile(
    input.assetClass,
    input.market,
    input.country,
    submarket,
    input.profileRules
  );
  const factorSnapshot = buildMacroFactorSnapshot({
    market: input.market,
    marketSnapshot: input.marketSnapshot,
    series: input.series
  });
  const inflationPct =
    getSeriesValue(snapshot, 'inflation_pct') ?? input.marketSnapshot?.inflationPct ?? null;
  const debtCostPct =
    getSeriesValue(snapshot, 'debt_cost_pct') ?? input.marketSnapshot?.debtCostPct ?? null;
  const capRatePct =
    getSeriesValue(snapshot, 'cap_rate_pct') ?? input.marketSnapshot?.capRatePct ?? null;
  const discountRatePct =
    getSeriesValue(snapshot, 'discount_rate_pct') ?? input.marketSnapshot?.discountRatePct ?? null;
  const vacancyPct =
    getSeriesValue(snapshot, 'vacancy_pct') ?? input.marketSnapshot?.vacancyPct ?? null;
  const policyRatePct = getSeriesValue(snapshot, 'policy_rate_pct');
  const creditSpreadBps = getSeriesValue(snapshot, 'credit_spread_bps');
  const rentGrowthPct = getSeriesValue(snapshot, 'rent_growth_pct');
  const transactionVolumeIndex = getSeriesValue(snapshot, 'transaction_volume_index');
  const constructionCostIndex = getSeriesValue(snapshot, 'construction_cost_index');
  const rateLevel = getMacroFactorValue(factorSnapshot, 'rate_level');
  const rateMomentumBps = getMacroFactorValue(factorSnapshot, 'rate_momentum_bps');
  const creditStress = getMacroFactorValue(factorSnapshot, 'credit_stress');
  const liquidity = getMacroFactorValue(factorSnapshot, 'liquidity');
  const constructionPressure = getMacroFactorValue(factorSnapshot, 'construction_pressure');
  const propertyDemand = getMacroFactorValue(factorSnapshot, 'property_demand');

  const regimes = {
    capitalMarkets: buildCapitalMarketsBlock(
      input.assetClass,
      profile,
      debtCostPct,
      discountRatePct,
      policyRatePct,
      creditStress ?? creditSpreadBps,
      rateLevel,
      rateMomentumBps
    ),
    leasing: buildLeasingBlock(
      input.assetClass,
      profile,
      vacancyPct,
      rentGrowthPct,
      transactionVolumeIndex,
      propertyDemand,
      liquidity
    ),
    construction: buildConstructionBlock(
      input.assetClass,
      profile,
      inflationPct,
      constructionCostIndex,
      constructionPressure,
      input.marketSnapshot
    ),
    refinance: buildRefinanceBlock(
      input.assetClass,
      profile,
      debtCostPct,
      capRatePct,
      creditStress ?? creditSpreadBps,
      liquidity ?? transactionVolumeIndex
    )
  };
  const guidance = buildGuidance(regimes, profile);
  const impacts = buildMacroImpactMatrix({
    assetClass: input.assetClass,
    profile,
    factors: factorSnapshot.factors,
    regimes,
    guidance
  });

  return {
    ...snapshot,
    assetClass: input.assetClass,
    profile,
    factors: factorSnapshot.factors,
    impacts,
    regimes,
    guidance
  };
}
