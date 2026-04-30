/**
 * Sector peer benchmarks for credit ratios. Real institutional IMs
 * cite KR data-center sponsor median / 75th percentile so the LP
 * can place this counterparty against the peer set rather than
 * against generic PE thresholds. The numbers below are sector
 * estimates curated from CBRE Korea / JLL / Cushman published
 * reports — not contract-grade — and the IM renders the source
 * caveat alongside.
 */

export type PeerBenchmark = {
  ratioKey: string;
  median: number;
  pct25: number;
  pct75: number;
  /** Higher is better for "higher" ratios; "lower" for ratios where lower is preferred. */
  preferred: 'higher' | 'lower';
};

const BENCHMARKS: Record<string, PeerBenchmark[]> = {
  KR_DATA_CENTER: [
    { ratioKey: 'leverage', median: 4.2, pct25: 5.0, pct75: 3.5, preferred: 'lower' },
    { ratioKey: 'netLeverage', median: 3.8, pct25: 4.5, pct75: 3.1, preferred: 'lower' },
    { ratioKey: 'interestCoverage', median: 2.8, pct25: 2.0, pct75: 3.5, preferred: 'higher' },
    { ratioKey: 'debtToEquity', median: 1.4, pct25: 1.8, pct75: 1.0, preferred: 'lower' },
    { ratioKey: 'cashToDebt', median: 0.12, pct25: 0.06, pct75: 0.20, preferred: 'higher' },
    { ratioKey: 'ebitdaMargin', median: 31, pct25: 26, pct75: 38, preferred: 'higher' },
    { ratioKey: 'roeProxy', median: 0.22, pct25: 0.16, pct75: 0.30, preferred: 'higher' },
    { ratioKey: 'roaProxy', median: 0.10, pct25: 0.07, pct75: 0.14, preferred: 'higher' }
  ],
  KR_OFFICE: [
    { ratioKey: 'leverage', median: 4.5, pct25: 5.5, pct75: 3.8, preferred: 'lower' },
    { ratioKey: 'interestCoverage', median: 2.2, pct25: 1.7, pct75: 2.8, preferred: 'higher' },
    { ratioKey: 'ebitdaMargin', median: 45, pct25: 38, pct75: 52, preferred: 'higher' }
  ]
};

const SECTOR_LABEL: Record<string, string> = {
  KR_DATA_CENTER: 'KR data-center sponsor peer set',
  KR_OFFICE: 'KR office sponsor peer set'
};

const SOURCE_CAVEAT =
  'Curated from CBRE Korea / JLL / Cushman published sponsor screens; sector estimate, not contract-grade.';

export type PeerComparison = {
  ratioKey: string;
  observedValue: number | null;
  median: number;
  pct25: number;
  pct75: number;
  /** Where this counterparty sits: 'top' / 'mid' / 'bottom' / null when missing. */
  band: 'top' | 'mid' | 'bottom' | null;
  preferred: 'higher' | 'lower';
};

export type PeerBenchmarkSummary = {
  sectorKey: string;
  sectorLabel: string;
  sourceCaveat: string;
  comparisons: PeerComparison[];
};

function classifyBand(
  value: number,
  bench: PeerBenchmark
): 'top' | 'mid' | 'bottom' {
  if (bench.preferred === 'higher') {
    if (value >= bench.pct75) return 'top';
    if (value >= bench.median) return 'mid';
    return 'bottom';
  }
  // lower-preferred: smaller values are better; pct75 is the 75th pct
  // best (= smallest value), so 'top' = value <= pct75
  if (value <= bench.pct75) return 'top';
  if (value <= bench.median) return 'mid';
  return 'bottom';
}

export function buildPeerComparison(
  observed: Record<string, number | null>,
  sectorKey: keyof typeof BENCHMARKS = 'KR_DATA_CENTER'
): PeerBenchmarkSummary {
  const set = BENCHMARKS[sectorKey] ?? BENCHMARKS.KR_DATA_CENTER!;
  const comparisons = set.map<PeerComparison>((bench) => {
    const value = observed[bench.ratioKey] ?? null;
    return {
      ratioKey: bench.ratioKey,
      observedValue: value,
      median: bench.median,
      pct25: bench.pct25,
      pct75: bench.pct75,
      band: value !== null ? classifyBand(value, bench) : null,
      preferred: bench.preferred
    };
  });
  return {
    sectorKey,
    sectorLabel: SECTOR_LABEL[sectorKey] ?? sectorKey,
    sourceCaveat: SOURCE_CAVEAT,
    comparisons
  };
}

/**
 * Map an Asset.assetClass to its corresponding peer benchmark
 * sector. Default to KR_DATA_CENTER when the class is unknown.
 */
export function pickSectorKey(
  assetClass: string | null | undefined,
  market: string | null | undefined
): keyof typeof BENCHMARKS {
  if (market !== 'KR' && market !== undefined && market !== null) {
    // We only carry KR sector tables today; non-KR uses the closest
    // KR analog as a directional reference.
  }
  if (assetClass === 'OFFICE') return 'KR_OFFICE';
  return 'KR_DATA_CENTER';
}
