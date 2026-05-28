import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { buildOrderedScenarioOutputs, pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { clamp, roundKrw, safeDivide } from '@/lib/services/valuation/utils';
import type { ProvenanceEntry } from '@/lib/sources/types';

/**
 * Vacant / development LAND has no stabilized NOI, so it must NOT run through
 * the income engine (`buildStabilizedIncomeValuation`). The OFFICE fallback
 * the orchestrator used previously derived value from rent → NOI → ÷ cap rate,
 * which is meaningless for raw land. This strategy values land directly off a
 * market land-price-per-sqm (a comparable / sales-comparison approach) with a
 * residual sanity layer, then flexes that value for entitlement upside and
 * holding-cost / illiquidity drag.
 */

// Conservative regional land-price-per-sqm fallback (KRW/sqm) used only when
// no comparable or asset-derived signal is available. Deliberately low so the
// bottom tier never overstates value.
const REGIONAL_FALLBACK_VALUE_PER_SQM_KRW = 1_500_000;

// Scenario flex factors applied to the base land value.
const BULL_VALUE_FACTOR = 1.25; // entitlement / rezoning upside
const BEAR_VALUE_FACTOR = 0.78; // holding-cost, time-to-permit, illiquidity drag

// Development / land discount proxies. Land is non-income-producing, so
// impliedYieldPct is 0 (no running yield) and exitCapRatePct carries a
// development-discount proxy rather than a stabilized exit cap.
const BASE_DEVELOPMENT_DISCOUNT_PCT = 8.5;

type LandValueDerivation = {
  valuePerSqmKrw: number;
  sourceTier: 'comparable' | 'gongsijiga_or_purchase' | 'regional_fallback';
  sourceLabel: string;
  comparableCount: number;
};

function deriveAreaSqm(bundle: UnderwritingBundle): number {
  const candidates = [
    bundle.asset.landAreaSqm,
    bundle.buildingSnapshot?.grossFloorAreaSqm,
    bundle.asset.grossFloorAreaSqm
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  // Final defensive floor so the valuation never multiplies by zero area.
  return 1;
}

function averageFinite(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

/**
 * Tiered land-value-per-sqm derivation:
 *   1. comparable / transaction comps (pricePerSqmKrw, or comp valuation ÷ area)
 *   2. 공시지가-style fallback via asset.purchasePriceKrw ÷ area
 *   3. conservative regional fallback constant
 */
function deriveLandValuePerSqm(
  bundle: UnderwritingBundle,
  areaSqm: number
): LandValueDerivation {
  // Tier 1a: explicit transaction comps with a per-sqm price.
  const txnPerSqm = (bundle.transactionComps ?? [])
    .map((comp) => comp.pricePerSqmKrw)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  // Tier 1b: comparable set entries — derive per-sqm from valuationKrw ÷ floor area.
  const compEntryPerSqm = (bundle.comparableSet?.entries ?? [])
    .map((entry) =>
      typeof entry.valuationKrw === 'number' &&
      typeof entry.grossFloorAreaSqm === 'number' &&
      entry.grossFloorAreaSqm > 0
        ? entry.valuationKrw / entry.grossFloorAreaSqm
        : null
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  const comparablePerSqm = averageFinite([...txnPerSqm, ...compEntryPerSqm]);
  const comparableCount = txnPerSqm.length + compEntryPerSqm.length;
  if (comparablePerSqm) {
    return {
      valuePerSqmKrw: comparablePerSqm,
      sourceTier: 'comparable',
      sourceLabel: `Sales-comparison: ${comparableCount} land/transaction comp(s)`,
      comparableCount
    };
  }

  // Tier 2: 공시지가-style fallback derived from the asset's own purchase price.
  const purchasePrice = bundle.asset.purchasePriceKrw;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) {
    return {
      valuePerSqmKrw: safeDivide(purchasePrice, areaSqm, 0),
      sourceTier: 'gongsijiga_or_purchase',
      sourceLabel: '공시지가/purchase-price-implied per-sqm (no comps)',
      comparableCount: 0
    };
  }

  // Tier 3: conservative regional fallback.
  return {
    valuePerSqmKrw: REGIONAL_FALLBACK_VALUE_PER_SQM_KRW,
    sourceTier: 'regional_fallback',
    sourceLabel: 'Conservative regional land-price fallback (no comps, no purchase price)',
    comparableCount: 0
  };
}

function buildLandScenarios(baseValueKrw: number): UnderwritingScenario[] {
  return buildOrderedScenarioOutputs([
    {
      name: 'Bull',
      scenarioOrder: 0,
      valuationKrw: baseValueKrw * BULL_VALUE_FACTOR,
      impliedYieldPct: 0, // land produces no running income
      exitCapRatePct: BASE_DEVELOPMENT_DISCOUNT_PCT - 1.5,
      debtServiceCoverage: 0, // no income to service debt
      notes:
        'Bull: successful rezoning / entitlement uplift and faster time-to-permit unlock development-ready land value.'
    },
    {
      name: 'Base',
      scenarioOrder: 1,
      valuationKrw: baseValueKrw,
      impliedYieldPct: 0,
      exitCapRatePct: BASE_DEVELOPMENT_DISCOUNT_PCT,
      debtServiceCoverage: 0,
      notes:
        'Base: market land value per sqm with current zoning; entitlement and permit timeline assumed in line with comparables.'
    },
    {
      name: 'Bear',
      scenarioOrder: 2,
      valuationKrw: baseValueKrw * BEAR_VALUE_FACTOR,
      impliedYieldPct: 0,
      exitCapRatePct: BASE_DEVELOPMENT_DISCOUNT_PCT + 2.5,
      debtServiceCoverage: 0,
      notes:
        'Bear: prolonged permit timeline, holding cost with no offsetting income, and land illiquidity compress realizable value.'
    }
  ]);
}

function buildConfidenceScore(derivation: LandValueDerivation): number {
  // Land valuations are inherently less certain — start mid-range and lower it
  // when the per-sqm value is not backed by comparables. Clamp to the engine's
  // 4.5–9.9 convention (see credit-overlay.ts).
  const base =
    derivation.sourceTier === 'comparable'
      ? 6.8
      : derivation.sourceTier === 'gongsijiga_or_purchase'
        ? 5.6
        : 4.8;
  return Number(clamp(base, 4.5, 9.9).toFixed(1));
}

function buildLandKeyRisks(derivation: LandValueDerivation): string[] {
  return [
    'Entitlement / zoning risk: realizable land value depends on rezoning and permitted use that are not yet secured.',
    'Permit timeline risk: development approval (인허가) can slip, extending the hold with no offsetting income.',
    'Soil / contamination / 지질 risk: ground conditions and remediation can materially change developable economics.',
    'Holding-cost drag: land carries property tax and financing cost while producing no income.',
    'Liquidity risk: raw land is illiquid; exit may require a price concession (토지거래허가구역 constraints may apply).',
    derivation.comparableCount === 0
      ? 'Valuation evidence risk: no land comparables available; per-sqm value relies on fallback derivation.'
      : 'Comparable selection risk: land comps differ in zoning, frontage, and access; adjustments are judgmental.'
  ];
}

function buildLandDdChecklist(): string[] {
  return [
    'Confirm zoning, floor-area-ratio, and permitted use, plus any 토지거래허가구역 (land-transaction-permit zone) status.',
    'Verify entitlement / development-permit timeline and probability with local authority records.',
    'Commission soil, contamination, and 지질 (geotechnical) survey for development feasibility.',
    'Model holding cost (property tax, financing) over the expected pre-development hold with no income.',
    'Validate infrastructure and access: road frontage, utility/power connection, and grid availability.',
    'Reconcile land area (지적도) against title and survey, and corroborate per-sqm value with 공시지가 and recent comps.'
  ];
}

function buildLandProvenance(derivation: LandValueDerivation, areaSqm: number): ProvenanceEntry[] {
  const fetchedAt = new Date().toISOString();
  return [
    {
      field: 'landValuePerSqmKrw',
      value: roundKrw(derivation.valuePerSqmKrw),
      sourceSystem: 'valuation.land-strategy',
      mode: derivation.sourceTier === 'comparable' ? 'cache' : 'fallback',
      fetchedAt,
      freshnessLabel: derivation.sourceLabel
    },
    {
      field: 'landAreaSqm',
      value: areaSqm,
      sourceSystem: 'valuation.land-strategy',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: 'Derived from asset.landAreaSqm / building snapshot'
    }
  ];
}

export async function buildLandValuationAnalysis(
  bundle: UnderwritingBundle,
  _context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const areaSqm = deriveAreaSqm(bundle);
  const derivation = deriveLandValuePerSqm(bundle, areaSqm);
  const baseValueKrw = roundKrw(areaSqm * derivation.valuePerSqmKrw);

  const scenarios = buildLandScenarios(baseValueKrw);
  const baseScenario = pickBaseScenario(scenarios) ?? scenarios[0];

  const analysis: UnderwritingAnalysis = {
    asset: {
      name: bundle.asset.name,
      assetCode: bundle.asset.assetCode,
      assetClass: bundle.asset.assetClass,
      stage: bundle.asset.stage,
      market: bundle.asset.market
    },
    baseCaseValueKrw: baseScenario.valuationKrw,
    confidenceScore: buildConfidenceScore(derivation),
    underwritingMemo: '',
    keyRisks: buildLandKeyRisks(derivation),
    ddChecklist: buildLandDdChecklist(),
    assumptions: {
      assetClass: 'LAND',
      valuationApproach: 'Sales-comparison (land price per sqm) with residual sanity layer',
      landAreaSqm: areaSqm,
      landValuePerSqmKrw: roundKrw(derivation.valuePerSqmKrw),
      valueSourceTier: derivation.sourceTier,
      valueSourceLabel: derivation.sourceLabel,
      comparableCount: derivation.comparableCount,
      scenarioFlexFactors: {
        bullValueFactor: BULL_VALUE_FACTOR,
        bearValueFactor: BEAR_VALUE_FACTOR,
        baseDevelopmentDiscountPct: BASE_DEVELOPMENT_DISCOUNT_PCT
      },
      incomeProducing: false
    },
    provenance: buildLandProvenance(derivation, areaSqm),
    scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
