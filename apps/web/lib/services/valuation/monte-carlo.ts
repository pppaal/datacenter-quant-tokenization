/**
 * Monte Carlo wrapper around the synthetic pro-forma.
 *
 * Draws correlated samples on the six drivers that swing IRR most
 * (entry cap, exit cap, rent growth, interest rate, occupancy, opex ratio),
 * rebuilds the 10-year pro-forma per draw, and collects the resulting return
 * distributions.
 *
 * Distribution choices (per driver) — see "Stochastic realism" below:
 *   - Entry cap, exit cap, interest rate: LOGNORMAL (right-skewed). Cap-rate
 *     widening and rate spikes are empirically right-skewed (the bad tail is
 *     fatter than the good tail). A lognormal with median == base reproduces
 *     this: the upper tail is heavier than the lower, and the draw is strictly
 *     positive so no hard clamp is needed.
 *   - Rent growth, occupancy, opex ratio: roughly SYMMETRIC normal, but with a
 *     SOFT (smooth) bound rather than a hard clamp so tail mass is not piled at
 *     the boundary (which would corrupt ES95/p1).
 *
 * Correlation (empirical RE literature, approximate):
 *   rate ↔ entry cap    +0.70    rates up → caps expand
 *   rate ↔ exit cap     +0.75    even stronger at exit
 *   rate ↔ growth       -0.35    high rates dampen rent growth
 *   entry ↔ exit cap     +0.85    both track the same spread to risk-free
 *   entry cap ↔ growth   -0.40    cap compression co-occurs with strong growth
 *   exit cap ↔ growth    -0.50    same, stronger at exit
 *   occupancy ↔ entry cap -0.45   soft markets => higher caps AND lower occupancy
 *   occupancy ↔ exit cap  -0.45
 *   occupancy ↔ growth    +0.45   strong demand lifts both rents and occupancy
 *   occupancy ↔ rate      -0.25   tighter financing conditions soften demand
 *   opex ↔ rate           +0.30   opex (utilities, wages) tracks inflation/rates
 *   opex ↔ growth         +0.20   inflationary periods push both rents and costs
 *   opex ↔ occupancy      -0.15   fuller buildings amortise fixed opex => lower ratio
 *
 * The correlation acts on the underlying standard normals via a Cholesky
 * factor; the per-driver marginal transform (lognormal vs soft-bounded normal)
 * is applied AFTER correlating, which preserves the rank/monotone correlation
 * structure (Gaussian copula).
 *
 * Variance reduction: ANTITHETIC VARIATES. Each correlated standard-normal
 * vector z is evaluated together with its mirror −z. Because the IRR response
 * is close to monotone in the drivers, the paired estimates are negatively
 * correlated, which roughly halves the variance of the mean/tail estimators at
 * the same iteration count. Pairing keeps the run fully deterministic.
 *
 * IMPORTANT INVARIANT: the deterministic base case (baseLeveredIrr /
 * baseUnleveredIrr / baseMoic) is a pure point estimate computed from
 * `baseInputs` with NO randomness. It is bit-for-bit independent of the
 * stochastic-draw machinery below and must stay so — other code relies on
 * "MC base == headline IRR".
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
  /**
   * Sample skewness of the realized draw distribution (Fisher–Pearson moment
   * coefficient g1). Positive => right-skewed (fatter upper tail). For the
   * lognormal drivers (cap rates, interest rate) this is expected to be > 0.
   */
  skewness: number;
};

export type CorrelationMatrix = number[][]; // NxN (N = driver count)

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
  realizedCorrelation: CorrelationMatrix; // post-transform correlation actually observed
  /**
   * Raw per-driver realized draws, in `driverOrder`, populated only when
   * `collectDriverDraws` is set. Off by default to keep the result lightweight;
   * used by tests/diagnostics that need the full sample (e.g. skewness, no
   * clamp pile-up checks).
   */
  driverDraws?: number[][];
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
    occupancyPp?: number;
    opexRatioPp?: number;
  };
  correlation?: CorrelationMatrix;
  /** Antithetic variates on by default; disable for variance-comparison tests. */
  antithetic?: boolean;
  /** Populate `driverDraws` with the full raw sample per driver. Default false. */
  collectDriverDraws?: boolean;
};

// Driver index order — used consistently across σ, correlation matrix,
// Cholesky factor, marginal transforms, and summaries.
const DRIVER_ORDER = [
  'Entry Cap Rate',
  'Exit Cap Rate',
  'Rent Growth',
  'Interest Rate',
  'Occupancy',
  'Opex Ratio'
];
const DRIVER_COUNT = DRIVER_ORDER.length;

// Per-driver marginal family. 'lognormal' => right-skewed, strictly positive,
// median == base. 'normal-soft' => symmetric draw with a smooth soft bound.
const DRIVER_FAMILY: ('lognormal' | 'normal-soft')[] = [
  'lognormal', // entry cap
  'lognormal', // exit cap
  'normal-soft', // rent growth
  'lognormal', // interest rate
  'normal-soft', // occupancy
  'normal-soft' // opex ratio (expressed as percentage points of ratio*100)
];

// Default correlation matrix — empirically motivated, PSD-verified (the
// Cholesky factorization below re-verifies positive-definiteness at runtime).
//          entry  exit  growth  rate   occ    opex
const DEFAULT_CORRELATION: CorrelationMatrix = [
  [1.0, 0.85, -0.4, 0.7, -0.45, 0.05], // entry cap
  [0.85, 1.0, -0.5, 0.75, -0.45, 0.05], // exit cap
  [-0.4, -0.5, 1.0, -0.35, 0.45, 0.2], // rent growth
  [0.7, 0.75, -0.35, 1.0, -0.25, 0.3], // interest rate
  [-0.45, -0.45, 0.45, -0.25, 1.0, -0.15], // occupancy
  [0.05, 0.05, 0.2, 0.3, -0.15, 1.0] // opex ratio
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

// ---------------------------------------------------------------------------
// Soft bound: a smooth, monotone, infinitely-differentiable squashing that
// asymptotically respects (lo, hi) without piling tail mass at the boundary.
// Values comfortably inside the band pass through essentially unchanged; only
// extreme draws are compressed, and they approach but NEVER reach the edge —
// so ES95/p1 reflect the true tail instead of a clamp artifact.
//
// Built from the smooth-max / smooth-min (LogSumExp) operators:
//   smoothMax(v, lo) = lo + softness·log(1 + exp((v - lo)/softness))   (> lo)
//   smoothMin(·, hi) = hi - softness·log(1 + exp((hi - ·)/softness))   (< hi)
// `softness` (in the same units as v) sets how gently the edge is approached.
// As softness → 0 this converges to the hard clamp; we keep it modest so the
// transform is near-identity well inside the band.
// ---------------------------------------------------------------------------
function softBound(v: number, lo: number, hi: number, softness: number): number {
  const s = Math.max(1e-9, softness);
  // softplus that avoids overflow for large arguments.
  const softplus = (t: number): number => (t > 30 ? t : Math.log1p(Math.exp(t)));
  // Smooth lower bound: strictly greater than lo, ≈ v when v ≫ lo.
  const lower = lo + s * softplus((v - lo) / s);
  // Smooth upper bound applied to the lower-bounded value: strictly less than
  // hi, ≈ lower when lower ≪ hi.
  return hi - s * softplus((hi - lower) / s);
}

// Marginal transform for one correlated standard-normal component `x`.
//  - lognormal: median == base, right-skewed; sigmaLog calibrated from the pp
//    sigma so that a 1σ move ≈ ±sigmaPp near the base, with a fatter upper tail.
//    Strictly positive => no clamp needed (soft positivity is intrinsic).
//  - normal-soft: base + sigmaPp*x, then soft-bounded inside [lo, hi].
function transformDriver(
  family: 'lognormal' | 'normal-soft',
  base: number,
  sigmaPp: number,
  x: number,
  lo: number,
  hi: number
): number {
  if (family === 'lognormal') {
    // sigmaLog set so exp(sigmaLog) - 1 ≈ sigmaPp/base near the mean: a 1σ
    // upward move scales `base` by ~ (1 + sigmaPp/base). Median == base exactly
    // (exp(0) = 1). Upper tail strictly fatter than lower => right skew.
    const rel = base > 0 ? sigmaPp / base : 0;
    const sigmaLog = Math.log1p(Math.max(0, rel));
    const value = base * Math.exp(sigmaLog * x);
    // Strictly positive already; apply a gentle soft-bound only to keep truly
    // pathological draws (|x| ≫ 4) finite and inside the model's domain. The
    // softness is small relative to the band so the transform is near-identity
    // (median == base, full right skew preserved) until the extreme tail.
    return softBound(value, lo, hi, Math.max(sigmaPp, base * 0.02));
  }
  const raw = base + sigmaPp * x;
  // Softness ≪ band width so the draw is effectively unbounded near the centre
  // and only the deep tail is gently compressed (no clamp pile-up).
  return softBound(raw, lo, hi, Math.max(sigmaPp * 0.5, 0.1));
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

// Fisher–Pearson sample skewness (g1). Positive => right-skewed.
function sampleSkewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (const v of xs) {
    const d = v - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  const denom = Math.pow(m2, 1.5);
  return denom > 1e-12 ? Number((m3 / denom).toFixed(4)) : 0;
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
  const useAntithetic = options.antithetic ?? true;
  const sigma = {
    capRatePp: options.sigma?.capRatePp ?? 0.5,
    exitCapRatePp: options.sigma?.exitCapRatePp ?? 0.75,
    growthPp: options.sigma?.growthPp ?? 1.0,
    interestRatePp: options.sigma?.interestRatePp ?? 0.5,
    occupancyPp: options.sigma?.occupancyPp ?? 4.0,
    // opex ratio σ expressed in percentage points of (ratio × 100): e.g. 3.0 pp.
    opexRatioPp: options.sigma?.opexRatioPp ?? 3.0
  };
  const sigmaArr = [
    sigma.capRatePp,
    sigma.exitCapRatePp,
    sigma.growthPp,
    sigma.interestRatePp,
    sigma.occupancyPp,
    sigma.opexRatioPp
  ];
  const correlation = options.correlation ?? DEFAULT_CORRELATION;
  const L = cholesky(correlation); // re-verifies PSD for the 6×6 matrix.

  const rng = mulberry32(seed);

  const leveredIrrs: number[] = [];
  const unleveredIrrs: number[] = [];
  const moics: number[] = [];

  // Per-driver realistic domains. Lognormal drivers stay positive by
  // construction; bounds here only soft-cap pathological draws. Occupancy is a
  // percentage (≈ base occupancy); opex ratio is carried as ratio × 100 (pp).
  const baseOccupancyPct = 100; // base draw centres on full effective occupancy
  const baseOpexPp = baseInputs.opexRatio * 100;
  const bounds = [
    [0.5, 20], // entry cap
    [0.5, 20], // exit cap
    [-5, 15], // growth
    [0.25, 18], // rate
    // Occupancy carried as an effective-demand factor centred on base (=100).
    // Band brackets base symmetrically so the soft bound stays near-identity
    // around the centre; values >100 represent demand upside (overflow/escalation).
    [40, 115], // occupancy %
    [5, 70] // opex ratio (pp of ratio×100)
  ];
  const bases = [
    baseInputs.capRatePct,
    baseInputs.exitCapRatePct,
    baseInputs.growthPct,
    baseInputs.interestRatePct,
    baseOccupancyPct,
    baseOpexPp
  ];

  // Baseline values for comparison — PURE point estimate, no randomness.
  // This block is intentionally independent of the stochastic machinery so the
  // "MC base == headline IRR" invariant holds bit-for-bit.
  const baseBuilt = buildSyntheticProForma(baseInputs);
  const baseMetrics = computeReturnMetricsFromProForma(
    baseBuilt.proForma,
    baseBuilt.extras.totalBasisKrw,
    baseBuilt.proForma.summary.initialDebtFundingKrw,
    baseBuilt.proForma.summary.netExitProceedsKrw,
    baseBuilt.proForma.summary.terminalValueKrw
  );

  const draws: number[][] = Array.from({ length: DRIVER_COUNT }, () => []);
  let validIterations = 0;

  // Evaluate one sampled driver vector → push metrics + record draws.
  const evaluateSample = (sampled: number[]): void => {
    for (let k = 0; k < DRIVER_COUNT; k++) draws[k]!.push(sampled[k]!);

    const capRatePct = sampled[0]!;
    const exitCapRatePct = sampled[1]!;
    const growthPct = sampled[2]!;
    const interestRatePct = sampled[3]!;
    const occupancyPct = sampled[4]!;
    const opexPp = sampled[5]!;
    const opexRatio = Math.min(0.95, Math.max(0.01, opexPp / 100));

    // Rebuild year1 NOI from the sampled cap rate so entry yield stays
    // consistent, then scale by the occupancy factor relative to base.
    const purchase = baseInputs.purchasePriceKrw;
    const occFactor = baseOccupancyPct > 0 ? occupancyPct / baseOccupancyPct : 1;
    const year1Noi = Math.round((purchase * capRatePct * occFactor) / 100);

    const draw: ProFormaInputs = {
      ...baseInputs,
      capRatePct,
      exitCapRatePct,
      growthPct,
      interestRatePct,
      opexRatio,
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
  };

  // Map a correlated standard-normal vector to driver values via per-driver
  // marginal transforms (Gaussian copula).
  const toSample = (zVec: number[]): number[] => {
    const x = applyCholesky(L, zVec);
    const sampled: number[] = new Array(DRIVER_COUNT);
    for (let k = 0; k < DRIVER_COUNT; k++) {
      sampled[k] = transformDriver(
        DRIVER_FAMILY[k]!,
        bases[k]!,
        sigmaArr[k]!,
        x[k]!,
        bounds[k]![0]!,
        bounds[k]![1]!
      );
    }
    return sampled;
  };

  // Antithetic variates: draw z for the "primary" iteration and reuse −z for
  // its partner. With antithetic on we draw ceil(iterations/2) base vectors and
  // emit each plus its mirror, capped at `iterations` total evaluations. With
  // it off, every iteration draws a fresh independent z. Either way the RNG is
  // consumed deterministically.
  if (useAntithetic) {
    let emitted = 0;
    const pairs = Math.ceil(iterations / 2);
    for (let p = 0; p < pairs && emitted < iterations; p++) {
      const z: number[] = new Array(DRIVER_COUNT);
      for (let k = 0; k < DRIVER_COUNT; k++) z[k] = standardNormal(rng);
      evaluateSample(toSample(z));
      emitted++;
      if (emitted < iterations) {
        const zNeg = z.map((v) => -v);
        evaluateSample(toSample(zNeg));
        emitted++;
      }
    }
  } else {
    for (let i = 0; i < iterations; i++) {
      const z: number[] = new Array(DRIVER_COUNT);
      for (let k = 0; k < DRIVER_COUNT; k++) z[k] = standardNormal(rng);
      evaluateSample(toSample(z));
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
      meanDrawnPct: Number(mean.toFixed(3)),
      skewness: ds.length ? sampleSkewness(ds) : 0
    };
  };

  // Realized correlation (post-transform) for diagnostic — should track the
  // target correlation under the Gaussian-copula mapping.
  const realized: CorrelationMatrix = Array.from({ length: DRIVER_COUNT }, (_, i) =>
    Array.from({ length: DRIVER_COUNT }, (__, j) => (i === j ? 1 : 0))
  );
  for (let i = 0; i < DRIVER_COUNT; i++) {
    for (let j = 0; j < DRIVER_COUNT; j++) {
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
      driverSummary('Interest Rate', baseInputs.interestRatePct, sigma.interestRatePp, draws[3]!),
      driverSummary('Occupancy', baseOccupancyPct, sigma.occupancyPp, draws[4]!),
      driverSummary('Opex Ratio', baseOpexPp, sigma.opexRatioPp, draws[5]!)
    ],
    baseLeveredIrr: baseMetrics.equityIrr,
    baseUnleveredIrr: baseMetrics.unleveragedIrr,
    baseMoic: baseMetrics.equityMultiple,
    correlationMatrix: correlation,
    driverOrder: [...DRIVER_ORDER],
    realizedCorrelation: realized,
    ...(options.collectDriverDraws ? { driverDraws: draws.map((d) => [...d]) } : {})
  };
}
