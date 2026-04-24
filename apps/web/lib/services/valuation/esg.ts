/**
 * ESG / energy-use overlay for Korean commercial property underwriting.
 *
 * Why a dedicated module:
 *   Korean CRE is under increasing regulatory + tenant ESG pressure —
 *   K-ETS (배출권거래제) has expanded to mid-size office buildings, multinational
 *   tenants under RE100 require renewable sourcing, and 녹색건축인증 (G-SEED) +
 *   에너지효율등급 are becoming de-facto leasing prerequisites for premium space.
 *   A pro-forma that ignores these misses:
 *     - Carbon cost (tCO2 × KRW price), which compounds as the free-allocation
 *       taper narrows through 2030.
 *     - Retrofit capex required to clear future regulatory bars.
 *     - Green-certified rent premium (3-8%) and occupancy stickiness.
 *     - Stranding risk — assets below grade 3 efficiency that will need heavy
 *       intervention before the 2030 regulatory step-up.
 *
 * Scope: Scope 2 (purchased electricity) only. Scope 1 (gas boilers etc.) is
 * asset-specific and best deferred to an audit-level workflow.
 *
 * Source anchors (embedded as constants, trivially overridable):
 *   - KR grid emission factor: 0.4594 kgCO2/kWh (2022 온실가스 인벤토리).
 *   - K-ETS allowance price: ~KRW 10,000/tCO2 trading band, assume 20,000/tCO2
 *     as mid-scenario for 2026+ (regulatory escalator expected).
 *   - G-SEED rent premium: 3-8% range, we use 5% for EXCELLENT/BEST.
 *   - Energy efficiency retrofit cost: KRW 150,000-400,000/sqm depending on
 *     starting grade. We bucket conservatively.
 */

export type EnergyEfficiencyGrade = '1++' | '1+' | '1' | '2' | '3' | '4' | '5' | null;
export type GSeedGrade = 'BEST' | 'EXCELLENT' | 'GOOD' | 'GENERAL' | null;
export type ZebLevel = 'ZEB1' | 'ZEB2' | 'ZEB3' | 'ZEB4' | 'ZEB5' | null;

export type EsgInput = {
  assetClass: string;
  gfaSqm: number;
  /** Current energy-efficiency grade per 국토부 energy label. */
  energyGrade: EnergyEfficiencyGrade;
  gSeedGrade: GSeedGrade;
  zebLevel: ZebLevel;
  /** Measured or estimated electricity use in kWh/sqm/yr. */
  electricityIntensityKwhPerSqm: number;
  renewablePct: number; // 0-100
  /** Fraction of GFA leased to tenants with RE100 / net-zero commitments. */
  re100TenantSharePct: number;
  /** Baseline monthly rent KRW/sqm — used to estimate green premium uplift. */
  monthlyRentKrwPerSqm: number;
};

export type EsgConfig = {
  /** kgCO2/kWh — Korean national grid factor. */
  gridEmissionFactorKgCo2PerKwh: number;
  /** Current K-ETS allowance price, KRW/tCO2. */
  carbonPriceKrwPerTco2: number;
  /** Annual escalator on carbon price. Default 8% (policy step-up path). */
  carbonPriceAnnualEscalatorPct: number;
  /** Baseline free-allocation ratio that will taper. */
  freeAllocationPct: number;
  /** Annual reduction in free allocation (pct points / yr). */
  freeAllocationTaperPctPerYear: number;
  /** Premium multiplier on rent when green-certified to EXCELLENT+. */
  greenPremiumRentUpliftPct: number;
  /** Years of hold (typically aligns with pro-forma horizon). */
  holdYears: number;
};

export const DEFAULT_ESG_CONFIG: EsgConfig = {
  gridEmissionFactorKgCo2PerKwh: 0.4594,
  carbonPriceKrwPerTco2: 20_000,
  carbonPriceAnnualEscalatorPct: 8,
  freeAllocationPct: 90,
  freeAllocationTaperPctPerYear: 5,
  greenPremiumRentUpliftPct: 5,
  holdYears: 10
};

// ---------------------------------------------------------------------------
// Scoring — simple weighted 0-100
// ---------------------------------------------------------------------------

const ENERGY_GRADE_SCORE: Record<string, number> = {
  '1++': 100,
  '1+': 90,
  '1': 80,
  '2': 65,
  '3': 50,
  '4': 30,
  '5': 15
};

const GSEED_GRADE_SCORE: Record<string, number> = {
  BEST: 100,
  EXCELLENT: 85,
  GOOD: 60,
  GENERAL: 40
};

const ZEB_LEVEL_SCORE: Record<string, number> = {
  ZEB1: 100,
  ZEB2: 85,
  ZEB3: 70,
  ZEB4: 55,
  ZEB5: 40
};

function scoreOrZero(map: Record<string, number>, key: string | null): number {
  if (!key) return 0;
  return map[key] ?? 0;
}

export type EsgScore = {
  overall: number;        // 0-100
  energyRatingScore: number;
  gSeedScore: number;
  zebScore: number;
  renewableScore: number;
  tenantDemandScore: number;
  stranding: 'LOW' | 'MODERATE' | 'HIGH';
};

export function scoreEsg(input: EsgInput): EsgScore {
  const energyRatingScore = scoreOrZero(ENERGY_GRADE_SCORE, input.energyGrade);
  const gSeedScore = scoreOrZero(GSEED_GRADE_SCORE, input.gSeedGrade);
  const zebScore = scoreOrZero(ZEB_LEVEL_SCORE, input.zebLevel);
  const renewableScore = Math.min(100, input.renewablePct * 1.5);
  // Tenant-demand score: high share of RE100 tenants = more green-value already captured,
  // but also structurally more demanding — score the alignment, not the count.
  const tenantDemandScore = Math.min(100, input.re100TenantSharePct);

  // Weights: 30 energy rating, 20 G-SEED, 20 ZEB, 20 renewable, 10 tenant.
  const overall = Math.round(
    energyRatingScore * 0.3 +
      gSeedScore * 0.2 +
      zebScore * 0.2 +
      renewableScore * 0.2 +
      tenantDemandScore * 0.1
  );

  // Stranding risk: low grade + no certification + post-2028 tightening.
  let stranding: EsgScore['stranding'] = 'LOW';
  const weakEnergy =
    input.energyGrade === null ||
    ['3', '4', '5'].includes(input.energyGrade);
  const weakCert = !input.gSeedGrade && !input.zebLevel;
  if (weakEnergy && weakCert) stranding = 'HIGH';
  else if (weakEnergy || weakCert) stranding = 'MODERATE';

  return { overall, energyRatingScore, gSeedScore, zebScore, renewableScore, tenantDemandScore, stranding };
}

// ---------------------------------------------------------------------------
// Carbon cost projection
// ---------------------------------------------------------------------------

export type CarbonCostYearRow = {
  year: number;
  scope2Tco2: number;
  freeAllocationTco2: number;
  liableTco2: number;
  carbonPriceKrw: number;
  carbonCostKrw: number;
};

export function projectCarbonCost(
  input: EsgInput,
  config: EsgConfig = DEFAULT_ESG_CONFIG
): CarbonCostYearRow[] {
  const annualKwh = input.gfaSqm * input.electricityIntensityKwhPerSqm;
  const fossilKwh = annualKwh * (1 - input.renewablePct / 100);
  const annualTco2 = (fossilKwh * config.gridEmissionFactorKgCo2PerKwh) / 1000;

  const rows: CarbonCostYearRow[] = [];
  for (let y = 1; y <= config.holdYears; y++) {
    const freePct = Math.max(
      0,
      config.freeAllocationPct - config.freeAllocationTaperPctPerYear * (y - 1)
    );
    const freeTco2 = annualTco2 * (freePct / 100);
    const liableTco2 = Math.max(0, annualTco2 - freeTco2);
    const priceKrw =
      config.carbonPriceKrwPerTco2 *
      Math.pow(1 + config.carbonPriceAnnualEscalatorPct / 100, y - 1);
    rows.push({
      year: y,
      scope2Tco2: Number(annualTco2.toFixed(2)),
      freeAllocationTco2: Number(freeTco2.toFixed(2)),
      liableTco2: Number(liableTco2.toFixed(2)),
      carbonPriceKrw: Math.round(priceKrw),
      carbonCostKrw: Math.round(liableTco2 * priceKrw)
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Retrofit economics: capex to reach ZEB5/grade-1, offset by premium + carbon
// savings, NPV'd to help judge "upgrade now vs let it strand".
// ---------------------------------------------------------------------------

// Ranges are capex per sqm to retrofit FROM the current condition to target.
// These are macro anchors; a real capex estimate is an engineering study.
const RETROFIT_COST_PER_SQM: Record<string, number> = {
  '1++_to_target': 0,
  '1+_to_target': 80_000,
  '1_to_target': 150_000,
  '2_to_target': 250_000,
  '3_to_target': 350_000,
  '4_to_target': 500_000,
  '5_to_target': 650_000,
  'null_to_target': 400_000
};

export type RetrofitEconomics = {
  estimatedCapexKrw: number;
  annualPremiumRevenueUpliftKrw: number;
  carbonCostSavedOverHoldKrw: number;
  simplePaybackYears: number | null;
  npv10yrKrw: number;
  verdict: 'STRONG_UPGRADE' | 'MARGINAL_UPGRADE' | 'SKIP';
};

function retrofitCostPerSqm(current: EnergyEfficiencyGrade): number {
  const key = current ? `${current}_to_target` : 'null_to_target';
  return RETROFIT_COST_PER_SQM[key] ?? 400_000;
}

export function estimateRetrofitEconomics(
  input: EsgInput,
  config: EsgConfig = DEFAULT_ESG_CONFIG,
  discountRatePct = 7
): RetrofitEconomics {
  const perSqm = retrofitCostPerSqm(input.energyGrade);
  const capex = perSqm * input.gfaSqm;

  // Premium uplift — applies only if we actually improve to EXCELLENT-equivalent.
  // Conservative: capture full premium only if currently below EXCELLENT.
  const premiumEligible =
    input.gSeedGrade !== 'EXCELLENT' && input.gSeedGrade !== 'BEST';
  const annualPremium = premiumEligible
    ? Math.round(
        input.gfaSqm *
          input.monthlyRentKrwPerSqm *
          12 *
          (config.greenPremiumRentUpliftPct / 100)
      )
    : 0;

  // Carbon savings — post-retrofit, assume electricity intensity drops 40%
  // and renewable share lifts to 50% at target.
  const baseline = projectCarbonCost(input, config).reduce(
    (s, r) => s + r.carbonCostKrw,
    0
  );
  const postRetrofit = projectCarbonCost(
    {
      ...input,
      electricityIntensityKwhPerSqm: input.electricityIntensityKwhPerSqm * 0.6,
      renewablePct: Math.max(input.renewablePct, 50)
    },
    config
  ).reduce((s, r) => s + r.carbonCostKrw, 0);
  const carbonSaved = Math.max(0, baseline - postRetrofit);

  // NPV: -capex now + sum of (annualPremium + year's carbon saving) discounted.
  // Use per-year carbon profile so the NPV captures the escalator correctly.
  const carbonRows = projectCarbonCost(input, config);
  const carbonRowsPost = projectCarbonCost(
    {
      ...input,
      electricityIntensityKwhPerSqm: input.electricityIntensityKwhPerSqm * 0.6,
      renewablePct: Math.max(input.renewablePct, 50)
    },
    config
  );
  let npv = -capex;
  for (let y = 1; y <= config.holdYears; y++) {
    const thisYearCarbonSaving =
      (carbonRows[y - 1]?.carbonCostKrw ?? 0) -
      (carbonRowsPost[y - 1]?.carbonCostKrw ?? 0);
    const cashflow = annualPremium + Math.max(0, thisYearCarbonSaving);
    npv += cashflow / Math.pow(1 + discountRatePct / 100, y);
  }

  const annualBenefit = annualPremium + carbonSaved / config.holdYears;
  const simplePayback =
    annualBenefit > 0 ? Number((capex / annualBenefit).toFixed(2)) : null;

  let verdict: RetrofitEconomics['verdict'] = 'SKIP';
  if (npv > capex * 0.2) verdict = 'STRONG_UPGRADE';
  else if (npv > 0) verdict = 'MARGINAL_UPGRADE';

  return {
    estimatedCapexKrw: Math.round(capex),
    annualPremiumRevenueUpliftKrw: annualPremium,
    carbonCostSavedOverHoldKrw: Math.round(carbonSaved),
    simplePaybackYears: simplePayback,
    npv10yrKrw: Math.round(npv),
    verdict
  };
}

// ---------------------------------------------------------------------------
// Top-level report assembly
// ---------------------------------------------------------------------------

export type EsgReport = {
  score: EsgScore;
  annualScope2Tco2: number;
  carbonCostByYear: CarbonCostYearRow[];
  totalCarbonCostOverHoldKrw: number;
  retrofit: RetrofitEconomics;
  notes: string[];
};

export function buildEsgReport(
  input: EsgInput,
  config: EsgConfig = DEFAULT_ESG_CONFIG
): EsgReport {
  const score = scoreEsg(input);
  const carbon = projectCarbonCost(input, config);
  const retrofit = estimateRetrofitEconomics(input, config);

  const notes: string[] = [];
  if (score.stranding === 'HIGH') {
    notes.push('HIGH stranding risk — asset likely non-compliant with 2028+ K-ETS tightening.');
  }
  if (input.re100TenantSharePct >= 30 && input.renewablePct < 30) {
    notes.push(
      `Tenant RE100 share (${input.re100TenantSharePct}%) outpaces on-site renewable share (${input.renewablePct}%) — tenant retention risk.`
    );
  }
  if (retrofit.verdict === 'STRONG_UPGRADE') {
    notes.push(
      `Retrofit NPV ${Math.round(retrofit.npv10yrKrw / 1_000_000_000)}bn KRW > 0 — upgrade is value-accretive before strand penalty.`
    );
  }
  if (input.energyGrade && ['1++', '1+', '1'].includes(input.energyGrade) && input.gSeedGrade === 'BEST') {
    notes.push('Top-tier energy & certification profile — qualify for green-fund pricing.');
  }

  const annualScope2Tco2 = carbon[0]?.scope2Tco2 ?? 0;
  const totalCarbonCost = carbon.reduce((s, r) => s + r.carbonCostKrw, 0);

  return {
    score,
    annualScope2Tco2,
    carbonCostByYear: carbon,
    totalCarbonCostOverHoldKrw: totalCarbonCost,
    retrofit,
    notes
  };
}
