/**
 * Cap rate decomposition for KR real estate underwriting.
 *
 * Real REPE / institutional research decomposes the headline cap
 * rate into 5 transparent components so a committee can see what
 * is driving the price:
 *
 *   cap_rate = RFR
 *            + sector_risk_premium       ( equity-style risk pricing )
 *            + submarket_spread          ( deviation from KR mean )
 *            − growth_expectation        ( income growth subtracted )
 *            + liquidity_discount        ( thin-market penalty )
 *            + obsolescence_factor       ( vintage-driven decay )
 *
 * The decomposition is the IM's cap rate prior: the engine can
 * either accept it directly, or blend with comp-set median + apply
 * a confidence weighting depending on data depth.
 *
 * Pure function, no DB / IO.
 */

export type CapRateInputs = {
  /** Risk-free rate — KR 10y govt bond yield, percent (e.g. 3.5). */
  riskFreeRatePct: number;
  /** Long-run equity risk premium (e.g. 4-6 for KR developed market). */
  equityRiskPremiumPct: number;
  /** Beta vs broad equity for the asset class (e.g. office ~0.6, DC ~0.45). */
  sectorBeta: number;
  /**
   * Submarket spread vs the KR-wide mean cap rate, in percentage
   * points. Positive = riskier than mean, negative = tighter.
   * Caller computes from a regression of comp cap rates on
   * submarket dummies; pass 0 when no signal.
   */
  submarketSpreadPct: number;
  /**
   * Long-run nominal income growth expectation (rent growth +
   * GDP nominal blend), percent. Subtracted from the cap rate
   * because higher expected growth justifies a tighter yield.
   */
  growthExpectationPct: number;
  /**
   * Transaction volume index where 100 = KR average. Used to
   * derive a liquidity discount: thin markets carry +50-150 bps.
   */
  transactionVolumeIndex: number;
  /** Asset vintage year — older property carries an obsolescence premium. */
  vintageYear: number;
  /** Reference year for obsolescence calc (defaults to current year). */
  referenceYear?: number;
};

export type CapRateComponent = {
  key:
    | 'riskFree'
    | 'sectorPremium'
    | 'submarketSpread'
    | 'growth'
    | 'liquidity'
    | 'obsolescence';
  label: string;
  pct: number;
  /** Direction in the additive equation. */
  sign: '+' | '-';
  notes: string;
};

export type CapRateDecomposition = {
  capRatePct: number;
  components: CapRateComponent[];
  /** Diagnostic — total of all components (sanity check vs capRatePct). */
  componentSumPct: number;
};

const DEFAULT_LIQUIDITY_BAND_BPS = 100; // 1.00% spread top to bottom of band
const DEFAULT_OBSOLESCENCE_BPS_PER_YEAR = 5; // 0.05% per year of age

/**
 * Compose the cap rate from its 5 components.  Returns the
 * implied cap rate plus per-component breakdown so the IM card
 * can render the bridge.
 */
export function decomposeCapRate(inputs: CapRateInputs): CapRateDecomposition {
  const {
    riskFreeRatePct,
    equityRiskPremiumPct,
    sectorBeta,
    submarketSpreadPct,
    growthExpectationPct,
    transactionVolumeIndex,
    vintageYear,
    referenceYear = new Date().getFullYear()
  } = inputs;

  const sectorPremiumPct = equityRiskPremiumPct * sectorBeta;
  // Liquidity: above 100 → tighter (negative discount); below → wider.
  // Map 50-150 index to ±50 bps around 0.
  const liquidityPct =
    ((100 - clampNumber(transactionVolumeIndex, 50, 150)) / 100) *
    (DEFAULT_LIQUIDITY_BAND_BPS / 100);
  // Obsolescence: each year of age = +5 bps (cap raised).
  const ageYears = Math.max(0, referenceYear - vintageYear);
  const obsolescencePct = (ageYears * DEFAULT_OBSOLESCENCE_BPS_PER_YEAR) / 100;

  const components: CapRateComponent[] = [
    {
      key: 'riskFree',
      label: 'Risk-free rate',
      pct: riskFreeRatePct,
      sign: '+',
      notes: 'KR 10y govt bond yield (BOK ECOS).'
    },
    {
      key: 'sectorPremium',
      label: 'Sector risk premium',
      pct: sectorPremiumPct,
      sign: '+',
      notes: `Equity ERP ${equityRiskPremiumPct.toFixed(1)}% × sector beta ${sectorBeta.toFixed(2)}.`
    },
    {
      key: 'submarketSpread',
      label: 'Submarket spread',
      pct: submarketSpreadPct,
      sign: '+',
      notes:
        submarketSpreadPct >= 0
          ? 'Submarket trades wider than KR-wide mean (regression on TransactionComp).'
          : 'Submarket trades tighter than KR-wide mean.'
    },
    {
      key: 'growth',
      label: 'Income growth',
      pct: growthExpectationPct,
      sign: '-',
      notes: 'Long-run nominal rent + GDP blend; tighter cap rate offsets growth.'
    },
    {
      key: 'liquidity',
      label: 'Liquidity discount',
      pct: liquidityPct,
      sign: liquidityPct >= 0 ? '+' : '-',
      notes:
        liquidityPct >= 0
          ? 'Transaction volume below KR mean → thin-market penalty.'
          : 'Transaction volume above KR mean → liquidity tightening.'
    },
    {
      key: 'obsolescence',
      label: 'Obsolescence',
      pct: obsolescencePct,
      sign: '+',
      notes: `${ageYears} years of age × ${DEFAULT_OBSOLESCENCE_BPS_PER_YEAR} bps/yr.`
    }
  ];

  // Sum signed components.
  let total = 0;
  for (const c of components) {
    total += c.sign === '+' ? c.pct : -c.pct;
  }

  return {
    capRatePct: round2(total),
    components,
    componentSumPct: round2(total)
  };
}

/**
 * Calibrate `submarketSpreadPct` from a comp matrix: regression of
 * cap rates on submarket dummies vs the KR-wide mean. Caller can
 * use this to feed `decomposeCapRate.submarketSpreadPct`.
 *
 * Implementation: simple difference of means with shrinkage toward
 * 0 when the submarket has fewer than `minComps` observations
 * (Bayesian-flavored — lets thin submarkets fall back to KR mean).
 */
export type SubmarketSpreadInput = {
  comps: Array<{ submarket: string | null; capRatePct: number | null }>;
  targetSubmarket: string;
  minComps?: number;
};

export function estimateSubmarketSpread(
  input: SubmarketSpreadInput
): { spreadPct: number; targetCount: number; krMeanPct: number } {
  const minComps = input.minComps ?? 3;
  const valid = input.comps.filter(
    (c): c is { submarket: string | null; capRatePct: number } =>
      typeof c.capRatePct === 'number' && Number.isFinite(c.capRatePct)
  );
  if (valid.length === 0) {
    return { spreadPct: 0, targetCount: 0, krMeanPct: 0 };
  }
  const krMean = valid.reduce((s, c) => s + c.capRatePct, 0) / valid.length;
  const targetRows = valid.filter((c) => c.submarket === input.targetSubmarket);
  if (targetRows.length === 0) {
    return { spreadPct: 0, targetCount: 0, krMeanPct: round2(krMean) };
  }
  const targetMean =
    targetRows.reduce((s, c) => s + c.capRatePct, 0) / targetRows.length;
  // Shrink toward 0 spread when count below threshold.
  const shrinkage = Math.min(targetRows.length / minComps, 1);
  const spread = (targetMean - krMean) * shrinkage;
  return {
    spreadPct: round2(spread),
    targetCount: targetRows.length,
    krMeanPct: round2(krMean)
  };
}

function clampNumber(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
