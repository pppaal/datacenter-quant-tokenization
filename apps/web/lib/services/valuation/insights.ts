/**
 * Valuation / research INSIGHT derivation — turns the engine's rich numeric
 * structs (tornado, Monte-Carlo tail, scenario spread, cap-rate build-up,
 * hedonic fit) into plain-language, threshold-gated IC bullets. The engine
 * computes these structures but renders them as raw tables; these pure helpers
 * are the missing "so what" layer. Each takes a minimal structural input so it
 * is unit-testable without building a full engine result.
 */
import { round } from '@/lib/math';

// ---------------------------------------------------------------------------
// 1. Tornado driver attribution
// ---------------------------------------------------------------------------

export type TornadoDriverLite = {
  label: string;
  /** IRR swing (pp) from low to high for this driver. */
  irrSwing: number;
  lowIrr: number | null;
  highIrr: number | null;
  deltaLabel?: string;
};

export type TornadoInsight = {
  topDriver: string | null;
  /** True when the top driver is >40% of total swing (sensitivity concentrated). */
  concentrationFlag: boolean;
  bullets: string[];
  /** Drivers whose grid endpoints didn't converge (null low/high). */
  degenerateDrivers: string[];
};

export function summarizeTornado(drivers: TornadoDriverLite[], baseIrrPct: number): TornadoInsight {
  const sorted = [...drivers].sort((a, b) => b.irrSwing - a.irrSwing);
  if (sorted.length === 0) {
    return { topDriver: null, concentrationFlag: false, bullets: [], degenerateDrivers: [] };
  }
  const total = sorted.reduce((s, d) => s + d.irrSwing, 0);
  const top = sorted[0];
  const concentrationFlag = total > 0 && top.irrSwing / total > 0.4;
  const bullets = sorted.slice(0, 3).map((d) => {
    const range =
      d.lowIrr !== null && d.highIrr !== null
        ? ` (${baseIrrPct.toFixed(1)}% → ${d.lowIrr.toFixed(1)}–${d.highIrr.toFixed(1)}%)`
        : '';
    const swing = round(d.irrSwing, 1);
    return `레버드 IRR은 ${d.label}에 가장 민감${d.deltaLabel ? ` (${d.deltaLabel})` : ''}: IRR ${swing}pp 변동${range}`;
  });
  return {
    topDriver: top.label,
    concentrationFlag,
    bullets,
    degenerateDrivers: sorted
      .filter((d) => d.lowIrr === null || d.highIrr === null)
      .map((d) => d.label)
  };
}

// ---------------------------------------------------------------------------
// 2. Monte-Carlo tail → risk bullets (incl. base-vs-median optimism gap)
// ---------------------------------------------------------------------------

export type MonteCarloInsightInput = {
  baseLeveredIrrPct: number;
  p5Pct: number | null;
  p50Pct: number | null;
  expectedShortfall95Pct?: number | null;
  probBelowZeroPct?: number | null;
};

export type MonteCarloInsight = {
  /** baseLeveredIrr − simulated median (pp). Positive ⇒ point estimate optimistic. */
  optimismGapPct: number | null;
  bullets: string[];
};

export function summarizeMonteCarloRisk(mc: MonteCarloInsightInput): MonteCarloInsight {
  const bullets: string[] = [];
  const optimismGapPct = mc.p50Pct !== null ? round(mc.baseLeveredIrrPct - mc.p50Pct, 1) : null;
  if (optimismGapPct !== null && optimismGapPct >= 1) {
    bullets.push(
      `기준안이 시뮬레이션 중앙값 대비 ${optimismGapPct}pp 낙관적 — 점추정이 중심경향을 과대평가`
    );
  }
  if (mc.p5Pct !== null) {
    const es =
      mc.expectedShortfall95Pct != null
        ? `, 해당 꼬리 기대손실 ${mc.expectedShortfall95Pct.toFixed(1)}%`
        : '';
    bullets.push(`20분의 1 하방: IRR ≤ ${mc.p5Pct.toFixed(1)}%${es}`);
  }
  if (mc.probBelowZeroPct != null && mc.probBelowZeroPct > 0) {
    bullets.push(`원금손실 확률 약 ${mc.probBelowZeroPct.toFixed(0)}% (IRR<0)`);
  }
  return { optimismGapPct, bullets };
}

// ---------------------------------------------------------------------------
// 3. Scenario asymmetry / skew
// ---------------------------------------------------------------------------

export type ScenarioSkewInsight = {
  skewRatio: number | null;
  verdict: 'favorable' | 'symmetric' | 'negative' | null;
  headline: string | null;
};

export function summarizeScenarioSkew(input: {
  upsidePct: number | null;
  downsidePct: number | null;
}): ScenarioSkewInsight {
  const { upsidePct, downsidePct } = input;
  if (upsidePct === null || downsidePct === null || downsidePct === 0) {
    return { skewRatio: null, verdict: null, headline: null };
  }
  const skewRatio = round(Math.abs(upsidePct) / Math.abs(downsidePct), 2);
  const verdict = skewRatio > 1.2 ? 'favorable' : skewRatio < 0.8 ? 'negative' : 'symmetric';
  const up = `+${Math.abs(upsidePct).toFixed(0)}%`;
  const down = `−${Math.abs(downsidePct).toFixed(0)}%`;
  const headline =
    verdict === 'favorable'
      ? `유리한 비대칭 (상방 ${up} vs 하방 ${down}, ${skewRatio}×)`
      : verdict === 'negative'
        ? `불리한 비대칭 — 하방 우세 (상방 ${up} vs 하방 ${down})`
        : `대칭적 위험/보상 (상방 ${up} vs 하방 ${down})`;
  return { skewRatio, verdict, headline };
}

// ---------------------------------------------------------------------------
// 4. Cap-rate build-up vs the deal's actual going-in cap
// ---------------------------------------------------------------------------

export type CapRateGapInsight = {
  gapBps: number;
  classification: 'rich' | 'cheap' | 'in-line';
  headline: string;
};

export function capRateGapToMarket(
  impliedCapPct: number,
  observedCapPct: number
): CapRateGapInsight {
  const gapBps = Math.round((observedCapPct - impliedCapPct) * 100);
  const classification = gapBps <= -10 ? 'rich' : gapBps >= 10 ? 'cheap' : 'in-line';
  const headline =
    classification === 'rich'
      ? `모델 내재 캡레이트 대비 ${Math.abs(gapBps)}bps 비싸게 거래 (rich) — 진입 캡 ${observedCapPct.toFixed(2)}% vs 내재 ${impliedCapPct.toFixed(2)}%`
      : classification === 'cheap'
        ? `모델 내재 캡레이트 대비 ${gapBps}bps 싸게 거래 (cheap) — 진입 캡 ${observedCapPct.toFixed(2)}% vs 내재 ${impliedCapPct.toFixed(2)}%`
        : `진입 캡레이트가 모델 내재값과 정합 (${observedCapPct.toFixed(2)}% vs ${impliedCapPct.toFixed(2)}%)`;
  return { gapBps, classification, headline };
}

// ---------------------------------------------------------------------------
// 5. Hedonic residual — subject cheap/rich vs the size/vintage-adjusted fit
// ---------------------------------------------------------------------------

export type HedonicResidualInsight = {
  zScore: number | null;
  pctGap: number | null;
  classification:
    | 'outlier-cheap'
    | 'outlier-rich'
    | 'mild-discount'
    | 'mild-premium'
    | 'in-line'
    | 'fit-too-weak';
  headline: string;
};

export function hedonicResidual(
  fit: { fittedLogPricePerSqm: number; residualStdErr: number; adjustedRSquared: number },
  observedPricePerSqm: number
): HedonicResidualInsight {
  if (fit.adjustedRSquared < 0.3 || fit.residualStdErr <= 0 || observedPricePerSqm <= 0) {
    return {
      zScore: null,
      pctGap: null,
      classification: 'fit-too-weak',
      headline: `헤도닉 적합도 부족 (R²=${fit.adjustedRSquared.toFixed(2)}) — 잔차 판정 보류`
    };
  }
  const logResidual = Math.log(observedPricePerSqm) - fit.fittedLogPricePerSqm;
  const zScore = round(logResidual / fit.residualStdErr, 2);
  const pctGap = round((Math.exp(logResidual) - 1) * 100, 1);
  const az = Math.abs(zScore);
  const cheap = zScore < 0;
  let classification: HedonicResidualInsight['classification'];
  if (az > 2) classification = cheap ? 'outlier-cheap' : 'outlier-rich';
  else if (az > 1) classification = cheap ? 'mild-discount' : 'mild-premium';
  else classification = 'in-line';
  const dir = cheap ? '저평가' : '고평가';
  const headline =
    classification === 'in-line'
      ? `헤도닉 적합선과 정합 (${pctGap > 0 ? '+' : ''}${pctGap}%, ${az.toFixed(1)}σ)`
      : `${az > 2 ? '이상치' : '경미한'} ${dir} — 적합선 대비 ${pctGap > 0 ? '+' : ''}${pctGap}% (${az.toFixed(1)}σ)`;
  return { zScore, pctGap, classification, headline };
}
