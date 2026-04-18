import type { AssetClass, MacroFactor } from '@prisma/client';
import type { MacroFactorDirection } from '@/lib/services/macro/factors';
import { macroSensitivityTemplateRegistry } from '@/lib/services/macro/profile-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DealMacroExposureDimension = {
  key: 'rate' | 'credit' | 'demand' | 'construction' | 'leverage' | 'liquidity';
  label: string;
  score: number;
  commentary: string;
};

export type DealMacroExposure = {
  dealId: string;
  market: string;
  assetClass: string | null;
  overallScore: number;
  band: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  dimensions: DealMacroExposureDimension[];
  summary: string;
  riskFactors: string[];
  mitigants: string[];
};

export type MacroStressScenario = {
  name: string;
  description: string;
  shocks: {
    rateShiftBps: number;
    spreadShiftBps: number;
    vacancyShiftPct: number;
    growthShiftPct: number;
    constructionCostShiftPct: number;
  };
};

export type DealStressTestResult = {
  dealId: string;
  scenario: MacroStressScenario;
  baselineCapRate: number | null;
  stressedCapRate: number | null;
  valuationImpactPct: number | null;
  verdict: 'RESILIENT' | 'SENSITIVE' | 'VULNERABLE';
  commentary: string;
};

// ---------------------------------------------------------------------------
// Predefined stress scenarios
// ---------------------------------------------------------------------------

export const STRESS_SCENARIOS: MacroStressScenario[] = [
  {
    name: 'Rate Shock',
    description: 'Policy rate +200bps with credit spread widening',
    shocks: { rateShiftBps: 200, spreadShiftBps: 75, vacancyShiftPct: 1.0, growthShiftPct: -0.5, constructionCostShiftPct: 0 }
  },
  {
    name: 'Credit Crunch',
    description: 'Spread widening, liquidity withdrawal, vacancy spike',
    shocks: { rateShiftBps: 50, spreadShiftBps: 150, vacancyShiftPct: 3.0, growthShiftPct: -1.5, constructionCostShiftPct: 2.0 }
  },
  {
    name: 'Stagflation',
    description: 'Rising rates with weak growth and elevated construction costs',
    shocks: { rateShiftBps: 100, spreadShiftBps: 50, vacancyShiftPct: 2.0, growthShiftPct: -2.0, constructionCostShiftPct: 15.0 }
  }
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type FactorLookup = Map<string, { value: number; direction: MacroFactorDirection; trendMomentum: number | null }>;

function buildFactorLookup(factors: MacroFactor[], market: string): FactorLookup {
  const map: FactorLookup = new Map();
  const sorted = factors
    .filter((f) => f.market === market)
    .sort((a, b) => b.observationDate.getTime() - a.observationDate.getTime());

  for (const f of sorted) {
    if (!map.has(f.factorKey)) {
      map.set(f.factorKey, {
        value: f.value,
        direction: f.direction as MacroFactorDirection,
        trendMomentum: f.trendMomentum
      });
    }
  }
  return map;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSensitivityMultiplier(assetClass: string | null, dimension: 'capitalRateSensitivity' | 'liquiditySensitivity' | 'leasingSensitivity' | 'constructionSensitivity'): number {
  if (!assetClass) return 1.0;
  const template = macroSensitivityTemplateRegistry[assetClass as AssetClass];
  return template?.[dimension] ?? 1.0;
}

function bandFromScore(score: number): DealMacroExposure['band'] {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MODERATE';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Core: Deal macro exposure scoring
// ---------------------------------------------------------------------------

type DealMacroInput = {
  id: string;
  market: string;
  assetClass: string | null;
  financingLtvPct: number | null;
  financingRatePct: number | null;
  stage: string;
};

export function computeDealMacroExposure(
  deal: DealMacroInput,
  factors: MacroFactor[]
): DealMacroExposure {
  const lookup = buildFactorLookup(factors, deal.market);
  const isDevelopment = ['SITE_SELECTION', 'LOI', 'DD'].includes(deal.stage);
  const ltv = deal.financingLtvPct ?? 55;
  const rate = deal.financingRatePct ?? 5.0;

  // --- Rate exposure ---
  const rateLevel = lookup.get('rate_level');
  const rateMomentum = lookup.get('rate_momentum_bps');
  let rateScore = 30;
  if (rateLevel && rateLevel.direction === 'NEGATIVE') rateScore += 25;
  if (rateMomentum && rateMomentum.direction === 'NEGATIVE') rateScore += 20;
  if (rateMomentum?.trendMomentum && rateMomentum.trendMomentum > 0) rateScore += 10;
  if (rate > 6) rateScore += 10;
  rateScore *= getSensitivityMultiplier(deal.assetClass, 'capitalRateSensitivity');

  // --- Credit exposure ---
  const creditStress = lookup.get('credit_stress');
  let creditScore = 20;
  if (creditStress && creditStress.direction === 'NEGATIVE') creditScore += 30;
  if (ltv > 65) creditScore += 20;
  else if (ltv > 55) creditScore += 10;
  if (creditStress?.trendMomentum && creditStress.trendMomentum > 0) creditScore += 10;

  // --- Demand exposure ---
  const demand = lookup.get('property_demand');
  const growth = lookup.get('growth_momentum');
  let demandScore = 25;
  if (demand && demand.direction === 'NEGATIVE') demandScore += 30;
  if (growth && growth.direction === 'NEGATIVE') demandScore += 15;
  demandScore *= getSensitivityMultiplier(deal.assetClass, 'leasingSensitivity');

  // --- Construction exposure (development deals get higher weight) ---
  const construction = lookup.get('construction_pressure');
  let constructionScore = isDevelopment ? 30 : 15;
  if (construction && construction.direction === 'NEGATIVE') constructionScore += isDevelopment ? 35 : 15;
  if (construction?.trendMomentum && construction.trendMomentum > 0) constructionScore += 10;
  constructionScore *= getSensitivityMultiplier(deal.assetClass, 'constructionSensitivity');

  // --- Leverage exposure ---
  let leverageScore = 15;
  if (ltv > 70) leverageScore = 75;
  else if (ltv > 60) leverageScore = 50;
  else if (ltv > 50) leverageScore = 30;
  if (rateMomentum && rateMomentum.direction === 'NEGATIVE') leverageScore += 15;

  // --- Liquidity exposure ---
  const liquidity = lookup.get('liquidity');
  let liquidityScore = 20;
  if (liquidity && liquidity.direction === 'NEGATIVE') liquidityScore += 35;
  liquidityScore *= getSensitivityMultiplier(deal.assetClass, 'liquiditySensitivity');

  const dimensions: DealMacroExposureDimension[] = [
    { key: 'rate', label: 'Rate Exposure', score: clamp(Math.round(rateScore), 0, 100), commentary: rateScore > 50 ? 'Elevated rate environment pressures financing costs and discount rates.' : 'Rate environment is manageable for current deal structure.' },
    { key: 'credit', label: 'Credit Exposure', score: clamp(Math.round(creditScore), 0, 100), commentary: creditScore > 50 ? 'Credit conditions are tight; refinancing risk is elevated.' : 'Credit conditions are within normal range.' },
    { key: 'demand', label: 'Demand Exposure', score: clamp(Math.round(demandScore), 0, 100), commentary: demandScore > 50 ? 'Tenant demand indicators are weakening.' : 'Demand fundamentals remain supportive.' },
    { key: 'construction', label: 'Construction Exposure', score: clamp(Math.round(constructionScore), 0, 100), commentary: constructionScore > 50 ? 'Construction cost inflation raises development risk.' : 'Construction cost pressure is contained.' },
    { key: 'leverage', label: 'Leverage Exposure', score: clamp(Math.round(leverageScore), 0, 100), commentary: leverageScore > 50 ? 'High leverage amplifies macro sensitivity.' : 'Leverage levels provide adequate buffer.' },
    { key: 'liquidity', label: 'Liquidity Exposure', score: clamp(Math.round(liquidityScore), 0, 100), commentary: liquidityScore > 50 ? 'Transaction liquidity is thin; exit timing risk.' : 'Market liquidity supports orderly exit.' }
  ];

  // Weighted overall score
  const weights = isDevelopment
    ? { rate: 0.20, credit: 0.15, demand: 0.15, construction: 0.25, leverage: 0.15, liquidity: 0.10 }
    : { rate: 0.25, credit: 0.20, demand: 0.20, construction: 0.05, leverage: 0.20, liquidity: 0.10 };

  const overallScore = clamp(
    Math.round(
      dimensions.reduce((sum, d) => sum + d.score * (weights[d.key] ?? 0.15), 0)
    ),
    0,
    100
  );

  const band = bandFromScore(overallScore);

  const riskFactors = dimensions.filter((d) => d.score >= 50).map((d) => d.commentary);
  const mitigants = dimensions.filter((d) => d.score < 30).map((d) => d.commentary);

  const summary =
    band === 'CRITICAL'
      ? `${deal.market} macro conditions present critical risk for this deal. Multiple stress vectors are active.`
      : band === 'HIGH'
        ? `Macro headwinds are material. Active monitoring and stress testing recommended.`
        : band === 'MODERATE'
          ? `Macro exposure is manageable but select risk factors warrant attention.`
          : `Macro conditions are supportive for this deal structure.`;

  return {
    dealId: deal.id,
    market: deal.market,
    assetClass: deal.assetClass,
    overallScore,
    band,
    dimensions,
    summary,
    riskFactors,
    mitigants
  };
}

// ---------------------------------------------------------------------------
// Stress testing
// ---------------------------------------------------------------------------

export function runMacroStressTest(
  deal: DealMacroInput,
  factors: MacroFactor[],
  scenario: MacroStressScenario
): DealStressTestResult {
  const lookup = buildFactorLookup(factors, deal.market);
  const ltv = deal.financingLtvPct ?? 55;
  const baseRate = deal.financingRatePct ?? 5.0;

  // Estimate baseline cap rate from macro data
  const rateLevel = lookup.get('rate_level')?.value ?? 4.5;
  const creditSpread = (lookup.get('credit_stress')?.value ?? 150) / 100;
  const baseCapRate = rateLevel + creditSpread * 0.3;

  // Apply scenario shocks
  const stressedRate = baseRate + scenario.shocks.rateShiftBps / 100;
  const stressedSpread = creditSpread + scenario.shocks.spreadShiftBps / 100;
  const stressedCapRate = baseCapRate + scenario.shocks.rateShiftBps / 200 + scenario.shocks.spreadShiftBps / 300;

  // Valuation impact: cap rate expansion effect + vacancy drag
  const capRateImpact = baseCapRate > 0 ? -(stressedCapRate - baseCapRate) / baseCapRate * 100 : 0;
  const vacancyDrag = -scenario.shocks.vacancyShiftPct * 1.5;
  const growthDrag = scenario.shocks.growthShiftPct * 2;
  const totalImpactPct = capRateImpact + vacancyDrag + growthDrag;

  // LTV amplification
  const leverageMultiplier = ltv > 60 ? 1.0 + (ltv - 60) / 100 : 1.0;
  const amplifiedImpact = totalImpactPct * leverageMultiplier;

  const verdict: DealStressTestResult['verdict'] =
    amplifiedImpact < -15 ? 'VULNERABLE' : amplifiedImpact < -8 ? 'SENSITIVE' : 'RESILIENT';

  const commentary =
    verdict === 'VULNERABLE'
      ? `Under "${scenario.name}", estimated valuation drops ${Math.abs(amplifiedImpact).toFixed(1)}%. Deal structure is vulnerable at current leverage.`
      : verdict === 'SENSITIVE'
        ? `Under "${scenario.name}", estimated valuation declines ${Math.abs(amplifiedImpact).toFixed(1)}%. Manageable but monitor closely.`
        : `Under "${scenario.name}", valuation impact is limited to ${Math.abs(amplifiedImpact).toFixed(1)}%. Deal structure demonstrates resilience.`;

  return {
    dealId: deal.id,
    scenario,
    baselineCapRate: Number(baseCapRate.toFixed(2)),
    stressedCapRate: Number(stressedCapRate.toFixed(2)),
    valuationImpactPct: Number(amplifiedImpact.toFixed(1)),
    verdict,
    commentary
  };
}

// ---------------------------------------------------------------------------
// Batch computation for pipeline view
// ---------------------------------------------------------------------------

export function buildDealMacroRiskSummary(
  deals: DealMacroInput[],
  factors: MacroFactor[]
): DealMacroExposure[] {
  return deals.map((deal) => computeDealMacroExposure(deal, factors));
}

export function runAllStressTests(
  deal: DealMacroInput,
  factors: MacroFactor[]
): DealStressTestResult[] {
  return STRESS_SCENARIOS.map((scenario) => runMacroStressTest(deal, factors, scenario));
}
