/**
 * 3-Approach reconciliation for income-producing property
 * (office / retail / industrial / multifamily) — mirrors 감정평가 3방식.
 *
 * Rules applied:
 *
 *   1. Cost — age-based depreciation using KR 내용연수 straight-line when
 *      approvalYear (사용승인년도) is known; stage-based fallback otherwise.
 *      Regional construction cost preferred from macroMicro.constructionCostPerSqmKrw;
 *      otherwise asset-class baseline × province/district multiplier.
 *
 *   2. Sales Comparison — weighted average of comparableSet entries and
 *      transaction comps. Weights combine area similarity, transaction
 *      recency (18-month half-life), and market match.
 *
 *   3. Income — NOI ÷ cap rate (engine-provided). Unchanged.
 *
 *   4. Reconciliation — weights shift with asset stage. Stabilized assets
 *      lean on income; under-stabilized or pre-built assets lean on cost.
 *      Approaches with no data drop to weight 0 and redistribute
 *      proportionally.
 *
 * Data-center valuation has its own 5-approach reconciliation inside
 * strategies/data-center.ts and does not use this module.
 */

import type { UnderwritingBundle } from '@/lib/services/valuation/types';

export type ValuationApproachKey = 'income' | 'salesComparison' | 'cost';

export type ValuationApproachDetail = {
  approach: ValuationApproachKey;
  labelKo: string;
  labelEn: string;
  valueKrw: number | null;
  valuePerSqmKrw: number | null;
  weight: number;
  dataQuality: 'high' | 'medium' | 'low' | 'unavailable';
  inputs: Record<string, number | string | null>;
  note: string;
};

export type ThreeApproachValuation = {
  approaches: ValuationApproachDetail[];
  reconciledValueKrw: number | null;
  reconciledValuePerSqmKrw: number | null;
  primaryApproach: ValuationApproachKey;
  methodology: string;
  rulesApplied: string[];
};

export type ComparableCompInput = {
  pricePerSqmKrw: number | null;
  areaSqm: number | null;
  transactionDate: Date | null;
  market: string | null;
  region: string | null;
};

export type ThreeApproachInputs = {
  rentableAreaSqm: number;
  stabilizedNoiKrw: number;
  capRatePct: number;

  assetClass: string;
  stage: string;
  subjectMarket: string;
  subjectProvince: string | null;
  subjectDistrict: string | null;

  comparableSetEntries: Array<{ pricePerSqmKrw: number | null; areaSqm: number | null }>;
  transactionComps: ComparableCompInput[];

  approvalYear: number | null;
  regionalConstructionCostPerSqmKrw: number | null;
  fallbackReplacementCostPerSqmKrw: number;
};

// ---------------------------------------------------------------------------
// Rule 1 helpers — cost approach age / region
// ---------------------------------------------------------------------------

// KR 내용연수 (tax code useful life) — aligns with full-report.ts
const USEFUL_LIFE_YEARS: Record<string, number> = {
  OFFICE: 40,
  RETAIL: 40,
  INDUSTRIAL: 20,
  MULTIFAMILY: 40,
  HOTEL: 30,
  DATA_CENTER: 20,
  LAND: 0,
  MIXED_USE: 40
};

// Economic depreciation floor — even fully tax-depreciated, a structure keeps
// residual utility. Cap accrued depreciation at 70% so Cost never drops below
// 30% of RCN.
const MAX_DEPRECIATION_PCT = 70;

// Stage fallback when approvalYear is unknown.
const STAGE_OBSOLESCENCE_PCT: Record<string, number> = {
  SCREENING: 0,
  LAND_SECURED: 0,
  POWER_REVIEW: 0,
  PERMITTING: 0,
  CONSTRUCTION: 0,
  LIVE: 5,
  STABILIZED: 15
};

// Regional multiplier applied to fallback replacement cost when macroMicro
// per-district construction cost is unavailable. Keyed on province with
// Seoul-prime submarket upgrade.
const PRIME_SEOUL_DISTRICTS = new Set([
  '강남구', '서초구', '송파구', '용산구', '영등포구', '중구', '종로구'
]);

function regionalCostMultiplier(province: string | null, district: string | null): number {
  if (!province) return 1.0;
  if (province.includes('서울')) {
    if (district && PRIME_SEOUL_DISTRICTS.has(district)) return 1.2;
    return 1.1;
  }
  if (province.includes('경기') || province.includes('인천')) return 1.05;
  if (province.includes('부산') || province.includes('대구') || province.includes('광주') || province.includes('대전') || province.includes('울산')) {
    return 0.95;
  }
  return 0.9;
}

function stageIsPreBuilt(stage: string): boolean {
  return ['SCREENING', 'LAND_SECURED', 'POWER_REVIEW', 'PERMITTING'].includes(stage);
}

function computeObsolescencePct(
  approvalYear: number | null,
  stage: string,
  assetClass: string,
  underwritingYear: number
): { pct: number; method: string } {
  if (approvalYear && approvalYear > 1900 && approvalYear <= underwritingYear) {
    const age = underwritingYear - approvalYear;
    const usefulLife = USEFUL_LIFE_YEARS[assetClass] ?? 40;
    if (usefulLife === 0) return { pct: 0, method: 'land-only' };
    const straightLinePct = Math.min(MAX_DEPRECIATION_PCT, (age / usefulLife) * 100);
    return { pct: straightLinePct, method: `age ${age}y / ${usefulLife}y straight-line` };
  }
  const stagePct = STAGE_OBSOLESCENCE_PCT[stage] ?? 10;
  return { pct: stagePct, method: `stage fallback (${stage})` };
}

// ---------------------------------------------------------------------------
// Rule 2 helpers — weighted sales comparison
// ---------------------------------------------------------------------------

const RECENCY_HALF_LIFE_MONTHS = 18;

function areaSimilarityWeight(subjectAreaSqm: number, compAreaSqm: number | null): number {
  if (!compAreaSqm || compAreaSqm <= 0 || subjectAreaSqm <= 0) return 0.5;
  const ratio = compAreaSqm / subjectAreaSqm;
  // Symmetric penalty around 1.0; weight = 1 / (1 + |ratio-1|). Same size → 1.0;
  // 2× or 0.5× → ~0.67; 3× or 0.33× → 0.5.
  return 1 / (1 + Math.abs(ratio - 1));
}

function recencyWeight(transactionDate: Date | null, underwritingYear: number): number {
  if (!transactionDate || isNaN(transactionDate.getTime())) return 0.5;
  const now = new Date(underwritingYear, 5, 30); // mid-year anchor
  const monthsAgo = Math.max(0, (now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
  // Exponential decay, half-life RECENCY_HALF_LIFE_MONTHS.
  return Math.pow(0.5, monthsAgo / RECENCY_HALF_LIFE_MONTHS);
}

function marketMatchWeight(
  compMarket: string | null,
  compRegion: string | null,
  subjectMarket: string,
  subjectProvince: string | null
): number {
  if (!compMarket) return 0.6;
  if (compMarket === subjectMarket) {
    if (compRegion && subjectProvince && compRegion.includes(subjectProvince)) return 1.0;
    return 0.85;
  }
  return 0.55;
}

type WeightedComp = {
  pricePerSqmKrw: number;
  weight: number;
};

function weightedAveragePrice(comps: WeightedComp[]): number | null {
  if (comps.length === 0) return null;
  const totalWeight = comps.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return null;
  return comps.reduce((s, c) => s + c.pricePerSqmKrw * c.weight, 0) / totalWeight;
}

// ---------------------------------------------------------------------------
// Rule 4 helpers — stage-based reconciliation weights
// ---------------------------------------------------------------------------

const STAGE_WEIGHT_PROFILE: Record<string, Record<ValuationApproachKey, number>> = {
  STABILIZED: { income: 0.55, salesComparison: 0.3, cost: 0.15 },
  LIVE: { income: 0.45, salesComparison: 0.3, cost: 0.25 },
  CONSTRUCTION: { income: 0.3, salesComparison: 0.25, cost: 0.45 },
  PERMITTING: { income: 0.2, salesComparison: 0.2, cost: 0.6 },
  POWER_REVIEW: { income: 0.2, salesComparison: 0.2, cost: 0.6 },
  LAND_SECURED: { income: 0.15, salesComparison: 0.2, cost: 0.65 },
  SCREENING: { income: 0.2, salesComparison: 0.2, cost: 0.6 }
};

const DEFAULT_WEIGHT_PROFILE = STAGE_WEIGHT_PROFILE.STABILIZED!;

function weightProfileForStage(stage: string): Record<ValuationApproachKey, number> {
  return STAGE_WEIGHT_PROFILE[stage] ?? DEFAULT_WEIGHT_PROFILE;
}

// ---------------------------------------------------------------------------
// Approach compute — each returns a detail block (weight filled in later)
// ---------------------------------------------------------------------------

function roundKrw(value: number): number {
  return Math.round(value);
}

function computeIncomeApproach(inputs: ThreeApproachInputs): ValuationApproachDetail {
  const valueKrw =
    inputs.capRatePct > 0 ? inputs.stabilizedNoiKrw / (inputs.capRatePct / 100) : null;
  return {
    approach: 'income',
    labelKo: '수익환원법',
    labelEn: 'Income Capitalization',
    valueKrw: valueKrw === null ? null : roundKrw(valueKrw),
    valuePerSqmKrw:
      valueKrw === null || inputs.rentableAreaSqm === 0
        ? null
        : roundKrw(valueKrw / inputs.rentableAreaSqm),
    weight: 0,
    dataQuality: 'high',
    inputs: {
      stabilizedNoiKrw: roundKrw(inputs.stabilizedNoiKrw),
      capRatePct: Number(inputs.capRatePct.toFixed(2))
    },
    note: 'NOI ÷ cap rate. Primary for stabilized income-producing property.'
  };
}

function computeSalesComparisonApproach(
  inputs: ThreeApproachInputs,
  underwritingYear: number
): ValuationApproachDetail {
  const weighted: WeightedComp[] = [];
  let usedTransactionCompCount = 0;
  let usedComparableEntryCount = 0;

  for (const entry of inputs.comparableSetEntries) {
    if (!entry.pricePerSqmKrw || entry.pricePerSqmKrw <= 0) continue;
    const weight = areaSimilarityWeight(inputs.rentableAreaSqm, entry.areaSqm) * 0.85;
    weighted.push({ pricePerSqmKrw: entry.pricePerSqmKrw, weight });
    usedComparableEntryCount += 1;
  }

  for (const comp of inputs.transactionComps) {
    if (!comp.pricePerSqmKrw || comp.pricePerSqmKrw <= 0) continue;
    const area = areaSimilarityWeight(inputs.rentableAreaSqm, comp.areaSqm);
    const recency = recencyWeight(comp.transactionDate, underwritingYear);
    const market = marketMatchWeight(comp.market, comp.region, inputs.subjectMarket, inputs.subjectProvince);
    const combined = area * recency * market;
    if (combined <= 0.05) continue; // drop essentially-irrelevant comps
    weighted.push({ pricePerSqmKrw: comp.pricePerSqmKrw, weight: combined });
    usedTransactionCompCount += 1;
  }

  const weightedPrice = weightedAveragePrice(weighted);
  const valueKrw = weightedPrice ? weightedPrice * inputs.rentableAreaSqm : null;

  const totalUsable = usedComparableEntryCount + usedTransactionCompCount;
  let dataQuality: ValuationApproachDetail['dataQuality'] = 'unavailable';
  if (totalUsable >= 5 || usedComparableEntryCount >= 3) dataQuality = 'high';
  else if (totalUsable >= 2) dataQuality = 'medium';
  else if (totalUsable === 1) dataQuality = 'low';

  return {
    approach: 'salesComparison',
    labelKo: '거래사례비교법',
    labelEn: 'Sales Comparison',
    valueKrw: valueKrw === null ? null : roundKrw(valueKrw),
    valuePerSqmKrw: weightedPrice ? roundKrw(weightedPrice) : null,
    weight: 0,
    dataQuality,
    inputs: {
      weightedPricePerSqmKrw: weightedPrice ? roundKrw(weightedPrice) : null,
      usedComparableEntries: usedComparableEntryCount,
      usedTransactionComps: usedTransactionCompCount
    },
    note:
      dataQuality === 'unavailable'
        ? 'No usable comps — excluded from reconciliation.'
        : `Weighted by area similarity × recency (${RECENCY_HALF_LIFE_MONTHS}-mo half-life) × market match.`
  };
}

function computeCostApproach(
  inputs: ThreeApproachInputs,
  underwritingYear: number
): ValuationApproachDetail {
  const regionalCostPerSqm =
    inputs.regionalConstructionCostPerSqmKrw ??
    inputs.fallbackReplacementCostPerSqmKrw *
      regionalCostMultiplier(inputs.subjectProvince, inputs.subjectDistrict);

  const replacementCostNewKrw = regionalCostPerSqm * inputs.rentableAreaSqm;
  const obs = computeObsolescencePct(inputs.approvalYear, inputs.stage, inputs.assetClass, underwritingYear);
  const depreciated = replacementCostNewKrw * (1 - obs.pct / 100);

  // If stage is pre-built (no structure yet), cost approach represents
  // intended replacement — still valid, but tag quality as low.
  const dataQuality: ValuationApproachDetail['dataQuality'] = stageIsPreBuilt(inputs.stage)
    ? 'low'
    : inputs.approvalYear
      ? 'high'
      : 'medium';

  return {
    approach: 'cost',
    labelKo: '원가법',
    labelEn: 'Cost Approach',
    valueKrw: roundKrw(depreciated),
    valuePerSqmKrw:
      inputs.rentableAreaSqm === 0 ? null : roundKrw(depreciated / inputs.rentableAreaSqm),
    weight: 0,
    dataQuality,
    inputs: {
      regionalCostPerSqmKrw: roundKrw(regionalCostPerSqm),
      replacementCostNewKrw: roundKrw(replacementCostNewKrw),
      obsolescencePct: Number(obs.pct.toFixed(1)),
      obsolescenceMethod: obs.method,
      approvalYear: inputs.approvalYear
    },
    note: stageIsPreBuilt(inputs.stage)
      ? 'Stage is pre-built — cost represents intended RCN, not current physical state.'
      : 'Regional replacement cost less KR 내용연수 straight-line depreciation.'
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function buildThreeApproachValuation(
  inputs: ThreeApproachInputs,
  underwritingYear = 2026
): ThreeApproachValuation {
  const income = computeIncomeApproach(inputs);
  const sales = computeSalesComparisonApproach(inputs, underwritingYear);
  const cost = computeCostApproach(inputs, underwritingYear);

  // Redistribute stage-weight profile across approaches that actually produced
  // a value, skipping any marked unavailable.
  const profile = weightProfileForStage(inputs.stage);
  const available = [income, sales, cost].filter(
    (a) => a.valueKrw !== null && a.dataQuality !== 'unavailable'
  );
  const totalProfileWeight = available.reduce((s, a) => s + profile[a.approach], 0) || 1;
  for (const approach of available) {
    approach.weight = Number((profile[approach.approach] / totalProfileWeight).toFixed(3));
  }

  const reconciledValueKrw = available.length
    ? roundKrw(available.reduce((sum, a) => sum + (a.valueKrw ?? 0) * a.weight, 0))
    : null;
  const reconciledValuePerSqmKrw =
    reconciledValueKrw !== null && inputs.rentableAreaSqm > 0
      ? roundKrw(reconciledValueKrw / inputs.rentableAreaSqm)
      : null;

  const primaryApproach: ValuationApproachKey = available.length
    ? available.reduce((winner, a) => (a.weight > winner.weight ? a : winner)).approach
    : 'income';

  const rulesApplied = [
    `Stage "${inputs.stage}" → weight profile ${JSON.stringify(profile)}`,
    sales.dataQuality === 'unavailable'
      ? 'Sales comparison excluded (no usable comps)'
      : `Sales comps weighted by area × recency × market (${sales.inputs.usedComparableEntries} comparable + ${sales.inputs.usedTransactionComps} transaction)`,
    inputs.approvalYear
      ? `Cost approach: ${cost.inputs.obsolescenceMethod} depreciation`
      : `Cost approach: ${cost.inputs.obsolescenceMethod}`,
    inputs.regionalConstructionCostPerSqmKrw
      ? 'Cost approach using district-level construction cost from macro snapshot'
      : `Cost approach using asset-class baseline × regional multiplier (${regionalCostMultiplier(inputs.subjectProvince, inputs.subjectDistrict).toFixed(2)})`
  ];

  const methodology = available.length === 3
    ? `All three appraisal approaches reconciled with stage-weighted profile (primary: ${primaryApproach}).`
    : available.some((a) => a.approach === 'salesComparison')
      ? 'Income + cost + market-validated sales comparison reconciled.'
      : 'Income + cost reconciled; no usable comps for market validation.';

  return {
    approaches: [income, sales, cost],
    reconciledValueKrw,
    reconciledValuePerSqmKrw,
    primaryApproach,
    methodology,
    rulesApplied
  };
}

// ---------------------------------------------------------------------------
// Convenience: derive inputs from a StabilizedIncomeValuation-like state.
// ---------------------------------------------------------------------------

export type ThreeApproachStateLike = {
  rentableAreaSqm: number;
  stabilizedNoiKrw: number;
  capRatePct: number;
};

export function deriveThreeApproachInputs(
  state: ThreeApproachStateLike,
  bundle: UnderwritingBundle,
  fallbackReplacementCostPerSqmKrw: number
): ThreeApproachInputs {
  const comparableSetEntries = (bundle.comparableSet?.entries ?? []).map((entry) => ({
    pricePerSqmKrw:
      entry.valuationKrw && entry.grossFloorAreaSqm
        ? entry.valuationKrw / entry.grossFloorAreaSqm
        : null,
    areaSqm: entry.grossFloorAreaSqm ?? null
  }));

  const transactionComps: ComparableCompInput[] = (bundle.transactionComps ?? []).map((c) => ({
    pricePerSqmKrw: typeof c.pricePerSqmKrw === 'number' ? c.pricePerSqmKrw : null,
    areaSqm: null, // TransactionComp schema has no area field — keep area weight neutral (0.5)
    transactionDate: c.transactionDate ? new Date(c.transactionDate) : null,
    market: c.market ?? null,
    region: c.region ?? null
  }));

  return {
    rentableAreaSqm: state.rentableAreaSqm,
    stabilizedNoiKrw: state.stabilizedNoiKrw,
    capRatePct: state.capRatePct,
    assetClass: bundle.asset.assetClass,
    stage: bundle.asset.stage,
    subjectMarket: bundle.asset.market,
    subjectProvince: bundle.address?.province ?? null,
    subjectDistrict: bundle.address?.district ?? null,
    comparableSetEntries,
    transactionComps,
    approvalYear: bundle.buildingContext?.approvalYear ?? null,
    regionalConstructionCostPerSqmKrw: bundle.buildingContext?.regionalConstructionCostPerSqmKrw ?? null,
    fallbackReplacementCostPerSqmKrw
  };
}
