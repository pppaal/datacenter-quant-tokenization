/**
 * Full-stack report builder: takes an AutoAnalyzeResult (valuation + scenarios +
 * macro regime already baked in) and attaches the remaining analysis layers:
 *
 *   - 10-year synthetic pro-forma (NOI grown at submarket rate → exit cap)
 *   - Cap rate × exit cap sensitivity, occupancy × rent sensitivity, rate sensitivity
 *   - Macro-driven sensitivity (axes from predefined stress scenarios)
 *   - Refinancing trigger analysis
 *   - Deal macro exposure scoring + stress test results
 *   - Debt covenant check (DSCR vs 1.15x floor across years)
 *   - Return metrics (levered IRR / unlevered IRR / MOIC / CoC / payback)
 *
 * All of this is computed in-memory from the autoAnalyze output — no DB writes,
 * no network calls. Intended to be invoked by the HTTP route + UI.
 */

import type { AssetClass, MacroFactor } from '@prisma/client';
import type { AutoAnalyzeResult } from '@/lib/services/property-analyzer/auto-analyze';
import type { ProFormaBaseCase, UnderwritingAnalysis } from '@/lib/services/valuation/types';
import { computeReturnMetricsFromProForma, type ReturnMetrics } from '@/lib/services/valuation/return-metrics';
import {
  buildCapRateExitSensitivity,
  buildInterestRateSensitivity,
  buildMacroDrivenSensitivity,
  buildOccupancyRentSensitivity,
  type MacroDrivenSensitivityMatrix,
  type OneWaySensitivityRow,
  type SensitivityMatrix
} from '@/lib/services/valuation/sensitivity';
import { analyzeRefinancing, type RefinanceAnalysis } from '@/lib/services/valuation/refinancing';
import { analyzeCovenants, type CovenantAnalysis } from '@/lib/services/valuation/covenants';
import {
  STRESS_SCENARIOS,
  computeDealMacroExposure,
  runMacroStressTest,
  type DealMacroExposure,
  type DealStressTestResult
} from '@/lib/services/macro/deal-risk';
import type { MacroMicroSnapshot } from '@/lib/services/public-data/types';
import {
  buildSyntheticProForma,
  type ProFormaInputs,
  type ProFormaExtras
} from '@/lib/services/valuation/synthetic-pro-forma';
import { runMonteCarlo, type MonteCarloResult } from '@/lib/services/valuation/monte-carlo';
import { evaluateInvestment, type InvestmentVerdict } from '@/lib/services/valuation/investment-verdict';
import { solveImpliedBids, type ImpliedBidSet } from '@/lib/services/valuation/implied-bid';
import {
  computeGpLpWaterfall,
  DEFAULT_WATERFALL_CONFIG,
  type GpLpWaterfallResult
} from '@/lib/services/valuation/gp-lp-waterfall';
import { generateInvestmentMemo, type InvestmentMemo } from '@/lib/services/property-analyzer/investment-memo';
import {
  sourceDebt,
  type DebtDealProfile,
  type DebtSourcingResult,
  type AssetClassFocus
} from '@/lib/services/valuation/debt-sourcing';
import {
  projectRentDefault,
  type RentDefaultProjection,
  type TenantExposure
} from '@/lib/services/valuation/tenant-credit';
import { buildProsConsReport, type ProsConsReport } from '@/lib/services/valuation/pros-cons';
import {
  computeIdiosyncraticRisk,
  type IdiosyncraticRiskInputs,
  type IdiosyncraticRiskReport,
  type RentRollEntry
} from '@/lib/services/valuation/idiosyncratic-risk';

const COVENANT_DSCR = 1.15;

export type MacroRegimeBlock = {
  label: string | null;
  summary: string[];
};

export type DebtCovenantCheck = {
  covenantFloor: number;
  baseYear1Dscr: number | null;
  yearsBelowFloor: number[];
  yearsBelowOne: number[];
  breachesInBase: boolean;
};

export type FullReport = {
  autoAnalyze: AutoAnalyzeResult;
  proForma: ProFormaBaseCase;
  proFormaExtras: ProFormaExtras;
  returnMetrics: ReturnMetrics;
  monteCarlo: MonteCarloResult;
  verdict: InvestmentVerdict;
  impliedBid: ImpliedBidSet;
  memo: InvestmentMemo;
  sensitivities: {
    capRateExit: SensitivityMatrix;
    occupancyRent: SensitivityMatrix;
    interestRate: OneWaySensitivityRow[];
    macroDriven: MacroDrivenSensitivityMatrix;
  };
  refinancing: RefinanceAnalysis;
  macro: {
    regime: MacroRegimeBlock;
    dealExposure: DealMacroExposure;
    stressTests: DealStressTestResult[];
  };
  debtCovenant: DebtCovenantCheck;
  covenantAnalysis: CovenantAnalysis;
  gpLpWaterfall: GpLpWaterfallResult;
  debtSourcing: DebtSourcingResult;
  tenantCredit: RentDefaultProjection | null;
  prosCons: ProsConsReport;
  idiosyncraticRisk: IdiosyncraticRiskReport;
};

export type BuildFullReportOptions = {
  /**
   * Optional tenant-level exposures (rent + financials) for credit overlay.
   * When provided, the report includes an expected-rent-loss projection.
   */
  tenantExposures?: TenantExposure[];
  /**
   * Optional asset-specific risk inputs (deferred capex, building age,
   * environmental flags, etc.). Tenant rent-roll is auto-derived from
   * `tenantExposures` if those are provided.
   */
  idiosyncraticRiskInputs?: Omit<IdiosyncraticRiskInputs, 'rentRoll' | 'asOfYear'>;
};

// ---------------------------------------------------------------------------
// Macro regime extraction from the assumptions blob (every strategy already
// calls buildMacroRegimeAnalysis and stores guidance inside assumptions).
// ---------------------------------------------------------------------------

function extractMacroRegime(analysis: UnderwritingAnalysis): MacroRegimeBlock {
  const a = analysis.assumptions as Record<string, unknown>;
  const macro = (a.macro ?? a.macroRegime ?? a['macro.guidance']) as
    | { label?: string; guidance?: { label?: string; summary?: string[] }; summary?: string[] }
    | undefined;
  if (!macro) {
    return { label: null, summary: [] };
  }
  const label = macro.label ?? macro.guidance?.label ?? null;
  const summary = macro.guidance?.summary ?? macro.summary ?? [];
  return { label, summary: Array.isArray(summary) ? summary : [] };
}

// Synthetic 10-year pro-forma extracted to ./synthetic-pro-forma.ts so Monte Carlo can reuse it.

// ---------------------------------------------------------------------------
// Synthetic MacroFactor[] for deal-risk/stress — derived from MacroMicroSnapshot
// so the scoring engine has something to reason about without a DB.
// ---------------------------------------------------------------------------

function synthesizeMacroFactors(
  market: string,
  macroMicro: MacroMicroSnapshot
): MacroFactor[] {
  const now = new Date();
  const vac = macroMicro.submarketVacancyPct ?? 8;
  const growth = macroMicro.submarketRentGrowthPct ?? 2;
  const inflation = macroMicro.submarketInflationPct ?? 2;

  const rateDir = inflation > 3 ? 'NEGATIVE' : inflation > 2 ? 'NEUTRAL' : 'POSITIVE';
  const demandDir = vac < 7 ? 'POSITIVE' : vac < 12 ? 'NEUTRAL' : 'NEGATIVE';
  const growthDir = growth > 3 ? 'POSITIVE' : growth > 1 ? 'NEUTRAL' : 'NEGATIVE';
  const constructionDir = inflation > 2.5 ? 'NEGATIVE' : 'NEUTRAL';

  const base = (key: string, label: string, value: number, direction: string): MacroFactor =>
    ({
      id: `synth-${key}`,
      assetId: null,
      market,
      factorKey: key,
      label,
      observationDate: now,
      value,
      unit: null,
      direction,
      commentary: null,
      sourceSystem: 'synthetic-from-macro-micro',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: now,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    }) as unknown as MacroFactor;

  return [
    base('rate_level', 'Policy Rate Level', inflation + 1.5, rateDir),
    base('rate_momentum_bps', 'Policy Rate Momentum (bps)', inflation > 2.5 ? 25 : 0, rateDir),
    base('credit_stress', 'Credit Spread Stress', inflation > 3 ? 75 : 35, rateDir),
    base('property_demand', 'Tenant Demand Index', 100 - vac * 2, demandDir),
    base('growth_momentum', 'Regional Growth Momentum', growth, growthDir),
    base('construction_pressure', 'Construction Cost Pressure', inflation, constructionDir),
    base('liquidity', 'Transaction Liquidity', vac > 12 ? 30 : 65, demandDir)
  ];
}

// ---------------------------------------------------------------------------
// Helper: opex ratio per asset class (aligns with bundle-assembler)
// ---------------------------------------------------------------------------

const OPEX_RATIO: Record<string, number> = {
  OFFICE: 0.25,
  RETAIL: 0.22,
  INDUSTRIAL: 0.18,
  MULTIFAMILY: 0.3,
  HOTEL: 0.55,
  DATA_CENTER: 0.45,
  LAND: 0.1,
  MIXED_USE: 0.28
};

// Land fraction of total basis (land is non-depreciable). Land-heavy = DC/industrial on large sites.
const LAND_VALUE_PCT: Record<string, number> = {
  OFFICE: 25,
  RETAIL: 30,
  INDUSTRIAL: 40,
  MULTIFAMILY: 20,
  HOTEL: 25,
  DATA_CENTER: 40,
  LAND: 95,
  MIXED_USE: 28
};

// KR 내용연수 straight-line schedule (tax code 기준 내용연수).
const DEPRECIATION_YEARS: Record<string, number> = {
  OFFICE: 40,
  RETAIL: 40,
  INDUSTRIAL: 20,
  MULTIFAMILY: 40,
  HOTEL: 30,
  DATA_CENTER: 20,
  LAND: 0,
  MIXED_USE: 40
};

// ---------------------------------------------------------------------------
// Debt-sourcing input mapping
// ---------------------------------------------------------------------------

function toDebtAssetClass(ac: string): AssetClassFocus {
  const upper = ac.toUpperCase();
  const allowed: AssetClassFocus[] = [
    'OFFICE',
    'RETAIL',
    'INDUSTRIAL',
    'MULTIFAMILY',
    'HOTEL',
    'DATA_CENTER',
    'LAND',
    'MIXED_USE'
  ];
  return (allowed.includes(upper as AssetClassFocus) ? upper : 'MIXED_USE') as AssetClassFocus;
}

function toDebtStage(stage: string | null | undefined): DebtDealProfile['stage'] {
  const s = (stage ?? '').toUpperCase();
  if (s === 'STABILIZED' || s === 'OPERATING') return 'STABILIZED';
  if (s === 'CONSTRUCTION' || s === 'DEVELOPMENT') return 'CONSTRUCTION';
  if (s === 'LEASE_UP' || s === 'PRE_STABILIZED' || s === 'LIVE') return 'LIVE';
  if (s === 'BRIDGE') return 'BRIDGE';
  if (s === 'LAND' || s === 'SCREENING' || s === 'POWER_REVIEW') return 'LAND';
  return 'STABILIZED';
}

// ---------------------------------------------------------------------------
// Main: buildFullReport
// ---------------------------------------------------------------------------

export async function buildFullReport(
  auto: AutoAnalyzeResult,
  options: BuildFullReportOptions = {}
): Promise<FullReport> {
  const primary = auto.primaryAnalysis;
  const baseScenario = primary.scenarios.find((s) => s.name === 'Base') ?? primary.scenarios[0]!;
  const bundle = auto.bundle;

  // Use the income-valuation as the investable entry price, not the land+replacement
  // cost stored on the asset (which can diverge massively for under-improved sites).
  const purchasePrice = primary.baseCaseValueKrw;
  const ltvPct = bundle.asset.financingLtvPct ?? 60;
  const interestRatePct = bundle.asset.financingRatePct ?? 5.4;
  const exitCapRatePct = baseScenario.exitCapRatePct || 6.0;
  const capRatePct = baseScenario.impliedYieldPct || exitCapRatePct;
  const year1Noi = Math.round((primary.baseCaseValueKrw * capRatePct) / 100);

  const macroMicro = auto.publicData.macroMicro as MacroMicroSnapshot;
  const growthPct = macroMicro.submarketRentGrowthPct ?? 2;
  const opexRatio = OPEX_RATIO[primary.asset.assetClass] ?? 0.3;
  const landValuePct = LAND_VALUE_PCT[primary.asset.assetClass] ?? 30;
  const depreciationYears = DEPRECIATION_YEARS[primary.asset.assetClass] ?? 40;

  const proFormaInputs: ProFormaInputs = {
    purchasePriceKrw: purchasePrice,
    ltvPct,
    interestRatePct,
    amortTermMonths: 180,
    capRatePct,
    exitCapRatePct,
    year1Noi,
    growthPct,
    opexRatio,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct,
    depreciationYears,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: Math.max(growthPct, 3),
    assetClass: String(primary.asset.assetClass)
  };
  const { proForma, extras: proFormaExtras } = buildSyntheticProForma(proFormaInputs);

  const initialDebt = proForma.summary.initialDebtFundingKrw;
  // totalCapex = total equity + debt basis (includes 취득세). This is what CF₀ measures against.
  const totalCapex = proFormaExtras.totalBasisKrw;
  const terminalValue = proForma.summary.terminalValueKrw;
  const netExit = proForma.summary.netExitProceedsKrw;
  const occupancyPct = bundle.asset.stabilizedOccupancyPct ?? bundle.asset.occupancyAssumptionPct ?? 85;

  const returnMetrics = computeReturnMetricsFromProForma(
    proForma,
    totalCapex,
    initialDebt,
    netExit,
    terminalValue
  );

  const monteCarlo = runMonteCarlo(proFormaInputs, { iterations: 1000, seed: 42 });

  const capRateExit = buildCapRateExitSensitivity(
    proForma,
    totalCapex,
    initialDebt,
    capRatePct,
    exitCapRatePct,
    year1Noi
  );
  const occupancyRent = buildOccupancyRentSensitivity(
    proForma,
    totalCapex,
    initialDebt,
    occupancyPct,
    terminalValue
  );
  const interestRate = buildInterestRateSensitivity(
    proForma,
    totalCapex,
    initialDebt,
    interestRatePct,
    terminalValue,
    proFormaInputs.amortTermMonths
  );
  const macroDriven = buildMacroDrivenSensitivity({
    proForma,
    totalCapexKrw: totalCapex,
    initialDebtFundingKrw: initialDebt,
    baseInterestRatePct: interestRatePct,
    baseOccupancyPct: occupancyPct,
    terminalValueKrw: terminalValue,
    scenarios: STRESS_SCENARIOS
  });

  const refinancing = analyzeRefinancing(proForma.years, interestRatePct, 180);

  const covenantAnalysis = analyzeCovenants(proForma.years, {
    capRatePct: exitCapRatePct
  });

  const factors = synthesizeMacroFactors(bundle.asset.market, macroMicro);
  const dealInput = {
    id: bundle.asset.id,
    market: bundle.asset.market,
    assetClass: bundle.asset.assetClass as AssetClass,
    financingLtvPct: bundle.asset.financingLtvPct,
    financingRatePct: bundle.asset.financingRatePct,
    stage: bundle.asset.stage
  };
  const dealExposure = computeDealMacroExposure(dealInput, factors);
  const stressTests = STRESS_SCENARIOS.map((scenario) =>
    runMacroStressTest(dealInput, factors, scenario)
  );

  const yearsBelowFloor = proForma.years
    .filter((y) => y.dscr !== null && y.dscr < COVENANT_DSCR)
    .map((y) => y.year);
  const yearsBelowOne = proForma.years
    .filter((y) => y.dscr !== null && y.dscr < 1.0)
    .map((y) => y.year);
  const debtCovenant: DebtCovenantCheck = {
    covenantFloor: COVENANT_DSCR,
    baseYear1Dscr: proForma.years[0]?.dscr ?? null,
    yearsBelowFloor,
    yearsBelowOne,
    breachesInBase: yearsBelowOne.length > 0
  };

  const verdict = evaluateInvestment({
    returnMetrics,
    monteCarlo,
    macroOverallScore: dealExposure.overallScore,
    debtCovenantBreaches: { yearsBelowFloor, yearsBelowOne },
    refinancing
  });

  const impliedBid = solveImpliedBids(proFormaInputs, {
    targetIrrPct: verdict.hurdlesUsed.targetLeveredIrrPct,
    floorIrrPct: verdict.hurdlesUsed.floorP10IrrPct,
    mcIterations: 400,
    mcSeed: 42
  });

  const gpLpWaterfall = computeGpLpWaterfall({
    initialEquityKrw: proForma.summary.initialEquityKrw,
    annualDistributionsKrw: proForma.years.map((y) => y.afterTaxDistributionKrw),
    netExitProceedsKrw: proForma.summary.netExitProceedsKrw,
    terminalYear: proForma.summary.terminalYear,
    config: DEFAULT_WATERFALL_CONFIG
  });

  // Tenant-credit rent-default overlay (only if caller supplied tenant exposures).
  const tenantCredit = options.tenantExposures && options.tenantExposures.length > 0
    ? projectRentDefault(options.tenantExposures)
    : null;

  const stabilizedDscr = proForma.years[0]?.dscr ?? 1.2;
  const stabilizedDebtYieldPct = initialDebt > 0 ? (year1Noi / initialDebt) * 100 : 0;
  const tenantIsIg = tenantCredit
    ? ['AAA', 'AA', 'A', 'BBB'].includes(tenantCredit.weightedGrade)
    : true;
  const debtDealProfile: DebtDealProfile = {
    assetClass: toDebtAssetClass(String(primary.asset.assetClass)),
    stage: toDebtStage(bundle.asset.stage as unknown as string),
    totalDealSizeKrw: purchasePrice,
    debtNeedKrw: initialDebt,
    targetLtvPct: ltvPct,
    stabilizedDscr,
    stabilizedDebtYieldPct,
    province: (bundle.address as { province?: string | null } | null)?.province ?? null,
    district: (bundle.address as { district?: string | null } | null)?.district ?? null,
    instrumentPreference: ['SENIOR_TERM'],
    tenantCreditIsInvestmentGrade: tenantIsIg,
    maxUnderwritingWeeks: 12
  };
  const debtSourcing = sourceDebt(debtDealProfile);

  // Idiosyncratic (asset-specific) risk. Auto-derive rent roll from tenant
  // exposures when provided so callers don't have to repeat themselves.
  const asOfYear = new Date().getFullYear();
  const derivedRentRoll: RentRollEntry[] | undefined = options.tenantExposures?.map((ex) => ({
    tenantName: ex.tenant.companyName,
    annualRentKrw: ex.annualRentKrw,
    leaseEndYear: asOfYear + Math.max(0, Math.round(ex.leaseRemainingYears)),
    creditGrade: null
  }));
  const idiosyncraticRisk = computeIdiosyncraticRisk({
    asOfYear,
    rentRoll: derivedRentRoll,
    buildingValueKrw: purchasePrice,
    ...(options.idiosyncraticRiskInputs ?? {})
  });

  // Aggregate every scoring engine's signal into a single pros/cons report.
  // Built after debtSourcing/tenantCredit/idiosyncratic so all inputs are available.
  const prosCons = buildProsConsReport({
    verdict,
    macroExposure: dealExposure,
    tenantCredit,
    debtSourcing,
    refinancing,
    idiosyncraticRisk
  });

  const regimeBlock = extractMacroRegime(primary);
  const memo = await generateInvestmentMemo({
    assetClass: String(primary.asset.assetClass),
    market: bundle.asset.market,
    districtName: auto.resolvedAddress.districtName,
    address: auto.resolvedAddress.roadAddress ?? auto.resolvedAddress.jibunAddress ?? '',
    basePriceKrw: purchasePrice,
    verdict,
    returnMetrics,
    monteCarlo,
    impliedBid,
    refinancing,
    dealExposure,
    macroRegimeLabel: regimeBlock.label,
    debtCovenantBreachYears: yearsBelowFloor,
    prosCons
  });

  return {
    autoAnalyze: auto,
    proForma,
    proFormaExtras,
    returnMetrics,
    monteCarlo,
    verdict,
    impliedBid,
    memo,
    sensitivities: {
      capRateExit,
      occupancyRent,
      interestRate,
      macroDriven
    },
    refinancing,
    macro: {
      regime: regimeBlock,
      dealExposure,
      stressTests
    },
    debtCovenant,
    covenantAnalysis,
    gpLpWaterfall,
    debtSourcing,
    tenantCredit,
    prosCons,
    idiosyncraticRisk
  };
}
