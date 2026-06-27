import assert from 'node:assert/strict';
import test from 'node:test';
import { fitHedonic, type CompRow, type HedonicQuery } from '@/lib/services/research/hedonic';

// A fully hand-solvable 3-point, 2-parameter (intercept + ln_size) fit. All
// rows share one submarket/tier/dealStructure and carry no vintage so the design
// has exactly p = 2 columns and df = n − p = 1. The reference numbers below were
// derived independently (closed-form 2×2 OLS) — see the test header for each.
const COMPS: CompRow[] = [
  { pricePerSqmKrw: 10_000_000, sizeSqm: 1000, submarket: 'A', tier: 'X', dealStructure: 'S' },
  { pricePerSqmKrw: 9_000_000, sizeSqm: 2000, submarket: 'A', tier: 'X', dealStructure: 'S' },
  { pricePerSqmKrw: 7_000_000, sizeSqm: 4000, submarket: 'A', tier: 'X', dealStructure: 'S' }
];
const QUERY: HedonicQuery = { sizeSqm: 3000, submarket: 'A', tier: 'X', dealStructure: 'S' };

// Hand-computed references (df = 1):
const REF = {
  fittedLog: 15.85976309751846,
  fittedPrice: 7723383.456214813,
  residualStdErr: 0.059585435314882904, // = σ̂
  sigma2: 0.0035504241016640946,
  predSE: 0.07308449126100755, // σ̂·√(1 + leverage), leverage = 0.5044238969583339
  retro: 1.0017767886725526, // exp(σ̂²/2)
  biasCorr: 7737106.276453596,
  piLogLower: 14.931136588498116, // ± t*·predSE, t*_{0.975,1} = 12.7062047...
  piLogUpper: 16.788389606538804,
  piPriceLower: 3051477.899687188,
  piPriceUpper: 19548118.640429135
};

function close(a: number, b: number, rel = 1e-6): boolean {
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
}

test('hedonic prediction SE = σ̂·√(1 + xᵀ(XᵀX)⁻¹x) matches hand value', () => {
  const fit = fitHedonic(COMPS, QUERY);
  assert.ok(fit !== null);
  assert.ok(
    close(fit!.fittedLogPricePerSqm, REF.fittedLog),
    `fittedLog ${fit!.fittedLogPricePerSqm}`
  );
  assert.ok(close(fit!.residualStdErr, REF.residualStdErr), `σ̂ ${fit!.residualStdErr}`);
  assert.ok(fit!.predictionStdErrLog !== null);
  assert.ok(close(fit!.predictionStdErrLog!, REF.predSE), `predSE ${fit!.predictionStdErrLog}`);
  // The prediction SE strictly exceeds the pure-noise σ̂ (the +1 leverage term).
  assert.ok(fit!.predictionStdErrLog! > fit!.residualStdErr);
});

test('hedonic 95% prediction interval (log + price) matches hand value', () => {
  const fit = fitHedonic(COMPS, QUERY)!;
  assert.ok(fit.predictionIntervalLog !== null);
  assert.ok(
    close(fit.predictionIntervalLog!.lower, REF.piLogLower),
    `lowerLog ${fit.predictionIntervalLog!.lower}`
  );
  assert.ok(
    close(fit.predictionIntervalLog!.upper, REF.piLogUpper),
    `upperLog ${fit.predictionIntervalLog!.upper}`
  );
  assert.ok(fit.predictionIntervalPriceKrw !== null);
  assert.ok(close(fit.predictionIntervalPriceKrw!.lower, REF.piPriceLower, 1e-4));
  assert.ok(close(fit.predictionIntervalPriceKrw!.upper, REF.piPriceUpper, 1e-4));
  // Interval brackets the naive headline; asymmetric (multiplicative) in level.
  assert.ok(fit.predictionIntervalPriceKrw!.lower < fit.fittedPricePerSqmKrw);
  assert.ok(fit.predictionIntervalPriceKrw!.upper > fit.fittedPricePerSqmKrw);
});

test('hedonic retransformation-bias correction = exp(σ̂²/2)·naive (mean ≥ median)', () => {
  const fit = fitHedonic(COMPS, QUERY)!;
  assert.ok(fit.retransformationFactor !== null);
  assert.ok(close(fit.retransformationFactor!, REF.retro), `retro ${fit.retransformationFactor}`);
  assert.ok(fit.fittedPricePerSqmKrwBiasCorrected !== null);
  assert.ok(
    close(fit.fittedPricePerSqmKrwBiasCorrected!, REF.biasCorr),
    `biasCorr ${fit.fittedPricePerSqmKrwBiasCorrected}`
  );
  // The bias-corrected mean is strictly above the naive median (factor > 1).
  assert.ok(fit.fittedPricePerSqmKrwBiasCorrected! > fit.fittedPricePerSqmKrw);
  // And exactly factor × naive.
  assert.ok(
    close(
      fit.fittedPricePerSqmKrwBiasCorrected!,
      fit.fittedPricePerSqmKrw * fit.retransformationFactor!
    )
  );
});

test('hedonic naive headline (fittedPricePerSqmKrw) is unchanged — consumers unbroken', () => {
  const fit = fitHedonic(COMPS, QUERY)!;
  assert.ok(close(fit.fittedPricePerSqmKrw, REF.fittedPrice));
  // It remains exactly exp(fittedLog) (the median), NOT the bias-corrected mean.
  assert.equal(fit.fittedPricePerSqmKrw, Math.exp(fit.fittedLogPricePerSqm));
});
