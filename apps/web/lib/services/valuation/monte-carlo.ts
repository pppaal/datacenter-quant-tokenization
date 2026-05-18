/**
 * Monte Carlo wrapper around the synthetic pro-forma.
 *
 * Draws correlated truncated-normal samples on the four drivers that swing
 * IRR most (entry cap, exit cap, rent growth, interest rate), rebuilds the
 * 10-year pro-forma per draw, and collects the resulting return distributions.
 *
 * Correlation (empirical RE literature, approximate):
 *   rate ↔ entry cap    +0.70    rates up → caps expand
 *   rate ↔ exit cap     +0.75    even stronger at exit
 *   rate ↔ growth       -0.35    high rates dampen rent growth
 *   entry ↔ exit cap    +0.85    both track the same spread to risk-free
 *   entry cap ↔ growth  -0.40    cap compression co-occurs with strong growth
 *   exit cap ↔ growth   -0.50    same, stronger at exit
 *
 * Implemented via Cholesky decomposition of the correlation matrix → apply
 * to four independent N(0,1) draws → scale by σ → add base → clamp to
 * realistic bounds. Clamping slightly biases the tails but only bites for
 * pathological σ.
 */
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';
import { computeReturnMetricsFromProForma } from '@/lib/services/valuation/return-metrics';

export type TailRiskMetrics = {
  // Lower-tail (loss) metrics: percentile boundary + Expected Shortfall (ES) =
  // mean of realizations strictly below the percentile cut. Reported in the
  // same units as the input distribution (e.g. IRR %).
  p5: number | null;
  p1: number | null;
  expectedShortfall95: number | null; // mean of bottom 5%
  expectedShortfall99: number | null; // mean of bottom 1%
  // Right tail for symmetry — useful when sizing upside in multi-exit / waterfall.
  p95: number | null;
  p99: number | null;
  // Semi-deviation: stdDev computed only over realizations < downsideTarget.
  // Captures downside dispersion without being polluted by the right tail.
  downsideDeviation: number | null;
  downsideTarget: number;
  // Worst observed realization across the run — informational, not a quantile.
  worstObserved: number | null;
  sampleCount: number;
};

export type MonteCarloDistribution = {
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  histogram: { binStart: number; binEnd: number; count: number }[];
  tail: TailRiskMetrics;
};

export type ProbabilityBelowTarget = {
  targetPct: number;
  probability: number; // 0..1
};

export type DriverSummary = {
  name: string;
  basePct: number;
  stdDevPct: number;
  minDrawnPct: number;
  maxDrawnPct: number;
  meanDrawnPct: number;
};

export type CorrelationMatrix = number[][]; // 4x4

export type MonteCarloResult = {
  iterations: number;
  seed: number;
  validIterations: number;
  leveredIrr: MonteCarloDistribution;
  unleveredIrr: MonteCarloDistribution;
  moic: MonteCarloDistribution;
  probLeveredIrrBelow: ProbabilityBelowTarget[];
  drivers: DriverSummary[];
  baseLeveredIrr: number | null;
  baseUnleveredIrr: number | null;
  baseMoic: number;
  correlationMatrix: CorrelationMatrix;
  driverOrder: string[];
  realizedCorrelation: CorrelationMatrix; // post-clamp correlation actually observed
};

export type MonteCarloOptions = {
  iterations?: number;
  seed?: number;
  targetIrrs?: number[];
  sigma?: {
    capRatePp?: number;
    exitCapRatePp?: number;
    growthPp?: number;
    interestRatePp?: number;
  };
  correlation?: CorrelationMatrix;
};

// Driver index order — used consistently across σ, correlation matrix,
// Cholesky factor, and clamping bounds.
const DRIVER_ORDER = ['Entry Cap Rate', 'Exit Cap Rate', 'Rent Growth', 'Interest Rate'];

// Default correlation matrix — empirically motivated, PSD-verified.
const DEFAULT_CORRELATION: CorrelationMatrix = [
  //  entry  exit  growth  rate
  [1.0, 0.85, -0.4, 0.7],
  [0.85, 1.0, -0.5, 0.75],
  [-0.4, -0.5, 1.0, -0.35],
  [0.7, 0.75, -0.35, 1.0]
];

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs given the same seed.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller → one standard normal per call. We use two uniforms each draw
// and discard the cos-pair's second value; cheap given mulberry32 is ~1 cycle.
function standardNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Cholesky: lower-triangular L s.t. L Lᵀ = Σ. Throws if Σ is not PSD.
// ---------------------------------------------------------------------------
function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i]![k]! * L[j]![k]!;
      if (i === j) {
        const diag = matrix[i]![i]! - sum;
        if (diag <= 0) {
          throw new Error(
            `Correlation matrix is not positive-definite at index ${i} (got ${diag.toFixed(4)}). ` +
              `Reduce off-diagonal magnitudes or verify symmetry.`
          );
        }
        L[i]![j] = Math.sqrt(diag);
      } else {
        L[i]![j] = (matrix[i]![j]! - sum) / L[j]![j]!;
      }
    }
  }
  return L;
}

function applyCholesky(L: number[][], z: number[]): number[] {
  const n = L.length;
  const x: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j <= i; j++) v += L[i]![j]! * z[j]!;
    x[i] = v;
  }
  return x;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Distribution summary
// ---------------------------------------------------------------------------
function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx] ?? null;
}

function emptyTail(): TailRiskMetrics {
  return {
    p5: null,
    p1: null,
    expectedShortfall95: null,
    expectedShortfall99: null,
    p95: null,
    p99: null,
    downsideDeviation: null,
    downsideTarget: 0,
    worstObserved: null,
    sampleCount: 0
  };
}

// Expected Shortfall (CVaR): mean of all realizations strictly below the
// `q`-quantile cut. With < 5 samples the tail estimate is meaningless, so we
// require at least 5 sub-quantile observations before reporting a number.
function expectedShortfall(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const cutIdx = Math.max(1, Math.floor(q * sorted.length));
  const tail = sorted.slice(0, cutIdx);
  if (tail.length < 5) return null;
  return Number((tail.reduce((s, v) => s + v, 0) / tail.length).toFixed(4));
}

function semiDeviation(values: number[], target: number): number | null {
  const below = values.filter((v) => v < target);
  if (below.length < 3) return null;
  const sq = below.reduce((s, v) => s + (v - target) ** 2, 0) / below.length;
  return Number(Math.sqrt(sq).toFixed(4));
}

function buildTailMetrics(sorted: number[], values: number[], downsideTarget = 0): TailRiskMetrics {
  if (sorted.length === 0) return emptyTail();
  return {
    p5: percentile(sorted, 0.05),
    p1: percentile(sorted, 0.01),
    expectedShortfall95: expectedShortfall(sorted, 0.05),
    expectedShortfall99: expectedShortfall(sorted, 0.01),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    downsideDeviation: semiDeviation(values, downsideTarget),
    downsideTarget,
    worstObserved: sorted[0] ?? null,
    sampleCount: values.length
  };
}

function summarize(values: number[], bins = 12, downsideTarget = 0): MonteCarloDistribution {
  if (values.length === 0) {
    return {
      p10: null,
      p25: null,
      p50: null,
      p75: null,
      p90: null,
      mean: null,
      stdDev: null,
      min: null,
      max: null,
      histogram: [],
      tail: emptyTail()
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  const histogram: { binStart: number; binEnd: number; count: number }[] = [];
  if (max > min) {
    const binWidth = (max - min) / bins;
    const counts = new Array(bins).fill(0);
    for (const v of values) {
      const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
      counts[idx]++;
    }
    for (let i = 0; i < bins; i++) {
      histogram.push({
        binStart: Number((min + i * binWidth).toFixed(2)),
        binEnd: Number((min + (i + 1) * binWidth).toFixed(2)),
        count: counts[i]
      });
    }
  } else {
    histogram.push({ binStart: min, binEnd: max, count: values.length });
  }

  return {
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    mean: Number(mean.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    min,
    max,
    histogram,
    tail: buildTailMetrics(sorted, values, downsideTarget)
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0,
    my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? Number((num / denom).toFixed(4)) : 0;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
export function runMonteCarlo(
  baseInputs: ProFormaInputs,
  options: MonteCarloOptions = {}
): MonteCarloResult {
  const iterations = Math.max(50, Math.min(10000, options.iterations ?? 1000));
  const seed = options.seed ?? 42;
  const targets = options.targetIrrs ?? [8, 10, 12, 15];
  const sigma = {
    capRatePp: options.sigma?.capRatePp ?? 0.5,
    exitCapRatePp: options.sigma?.exitCapRatePp ?? 0.75,
    growthPp: options.sigma?.growthPp ?? 1.0,
    interestRatePp: options.sigma?.interestRatePp ?? 0.5
  };
  const sigmaArr = [sigma.capRatePp, sigma.exitCapRatePp, sigma.growthPp, sigma.interestRatePp];
  const correlation = options.correlation ?? DEFAULT_CORRELATION;
  const L = cholesky(correlation);

  const rng = mulberry32(seed);

  const leveredIrrs: number[] = [];
  const unleveredIrrs: number[] = [];
  const moics: number[] = [];

  const draws: number[][] = [[], [], [], []]; // cap, exitCap, growth, rate
  const bounds = [
    [1, 20], // entry cap
    [1, 20], // exit cap
    [-5, 15], // growth
    [0, 15] // rate
  ];
  const bases = [
    baseInputs.capRatePct,
    baseInputs.exitCapRatePct,
    baseInputs.growthPct,
    baseInputs.interestRatePct
  ];

  // Baseline values for comparison
  const baseBuilt = buildSyntheticProForma(baseInputs);
  const baseMetrics = computeReturnMetricsFromProForma(
    baseBuilt.proForma,
    baseBuilt.extras.totalBasisKrw,
    baseBuilt.proForma.summary.initialDebtFundingKrw,
    baseBuilt.proForma.summary.netExitProceedsKrw,
    baseBuilt.proForma.summary.terminalValueKrw
  );

  let validIterations = 0;

  for (let i = 0; i < iterations; i++) {
    const z = [standardNormal(rng), standardNormal(rng), standardNormal(rng), standardNormal(rng)];
    const x = applyCholesky(L, z);

    const sampled: number[] = [];
    for (let k = 0; k < 4; k++) {
      sampled.push(clamp(bases[k]! + sigmaArr[k]! * x[k]!, bounds[k]![0]!, bounds[k]![1]!));
    }
    for (let k = 0; k < 4; k++) draws[k]!.push(sampled[k]!);

    const [capRatePct, exitCapRatePct, growthPct, interestRatePct] = sampled;

    // Rebuild year1 NOI from the sampled cap rate so entry yield stays consistent.
    const purchase = baseInputs.purchasePriceKrw;
    const year1Noi = Math.round((purchase * capRatePct!) / 100);

    const draw: ProFormaInputs = {
      ...baseInputs,
      capRatePct: capRatePct!,
      exitCapRatePct: exitCapRatePct!,
      growthPct: growthPct!,
      interestRatePct: interestRatePct!,
      year1Noi
    };

    try {
      const built = buildSyntheticProForma(draw);
      const metrics = computeReturnMetricsFromProForma(
        built.proForma,
        built.extras.totalBasisKrw,
        built.proForma.summary.initialDebtFundingKrw,
        built.proForma.summary.netExitProceedsKrw,
        built.proForma.summary.terminalValueKrw
      );

      if (metrics.equityIrr !== null) leveredIrrs.push(metrics.equityIrr);
      if (metrics.unleveragedIrr !== null) unleveredIrrs.push(metrics.unleveragedIrr);
      moics.push(metrics.equityMultiple);
      validIterations++;
    } catch {
      // skip failed iteration
    }
  }

  // Probability IRR below target (levered)
  const probLeveredIrrBelow: ProbabilityBelowTarget[] = targets.map((t) => ({
    targetPct: t,
    probability:
      leveredIrrs.length > 0
        ? Number((leveredIrrs.filter((v) => v < t).length / leveredIrrs.length).toFixed(4))
        : 0
  }));

  const driverSummary = (
    name: string,
    basePct: number,
    stdPp: number,
    ds: number[]
  ): DriverSummary => {
    const mean = ds.length ? ds.reduce((s, v) => s + v, 0) / ds.length : basePct;
    return {
      name,
      basePct: Number(basePct.toFixed(3)),
      stdDevPct: Number(stdPp.toFixed(3)),
      minDrawnPct: ds.length ? Number(Math.min(...ds).toFixed(3)) : basePct,
      maxDrawnPct: ds.length ? Number(Math.max(...ds).toFixed(3)) : basePct,
      meanDrawnPct: Number(mean.toFixed(3))
    };
  };

  // Realized correlation (post-clamp) for diagnostic
  const realized: CorrelationMatrix = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1]
  ];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i === j) continue;
      realized[i]![j] = pearson(draws[i]!, draws[j]!);
    }
  }

  return {
    iterations,
    seed,
    validIterations,
    // Downside targets: IRR 0% = principal loss boundary, MOIC 1.0x = no return.
    leveredIrr: summarize(leveredIrrs, 12, 0),
    unleveredIrr: summarize(unleveredIrrs, 12, 0),
    moic: summarize(moics, 12, 1.0),
    probLeveredIrrBelow,
    drivers: [
      driverSummary('Entry Cap Rate', baseInputs.capRatePct, sigma.capRatePp, draws[0]!),
      driverSummary('Exit Cap Rate', baseInputs.exitCapRatePct, sigma.exitCapRatePp, draws[1]!),
      driverSummary('Rent Growth', baseInputs.growthPct, sigma.growthPp, draws[2]!),
      driverSummary('Interest Rate', baseInputs.interestRatePct, sigma.interestRatePp, draws[3]!)
    ],
    baseLeveredIrr: baseMetrics.equityIrr,
    baseUnleveredIrr: baseMetrics.unleveragedIrr,
    baseMoic: baseMetrics.equityMultiple,
    correlationMatrix: correlation,
    driverOrder: [...DRIVER_ORDER],
    realizedCorrelation: realized
  };
}
