/**
 * Map the IM/sample-report headline figures into an `ImDeckInput` (the #136
 * PowerPoint builder's input). Pure + testable; the page extracts the compact
 * source from its already-computed data and the client export button renders
 * the deck (browser-side, no auth needed for the public IM).
 */
import type { ImDeckInput, ImDeckMetric } from '@/lib/services/exports/im-pptx';

export type ImReportDeckSource = {
  assetName: string;
  assetType: string;
  market: string;
  /** getValuationRecommendation output. */
  recommendation: string;
  /** Confidence on the 0–10 scale (latestRun.confidenceScore). */
  confidenceScore: number | null;
  baseValueKrw: number;
  goingInYieldPct: number | null;
  exitCapPct: number | null;
  minDscr: number | null;
  upsideToBullPct: number | null;
  downsideToBearPct: number | null;
};

/** Format a KRW amount compactly as 조/억/만/원. */
export function krwCompact(value: number): string {
  const abs = Math.abs(value);
  const eok = value / 100_000_000;
  if (abs >= 1_000_000_000_000) {
    // ≥ 1조 → 조 with one decimal.
    return `₩${(eok / 10_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}조`;
  }
  if (abs >= 100_000_000) {
    // ≥ 1억 → 억 with one decimal so sub-억 precision is not lost (a 1.5억 value
    // must not round to ₩2억, matching the rest of the desk's 억 formatting).
    return `₩${eok.toLocaleString('en-US', { maximumFractionDigits: 1 })}억`;
  }
  if (abs >= 10_000) {
    // ≥ 1만 → 만 (whole units); avoids collapsing sub-억 figures to "₩0억".
    return `₩${Math.round(value / 10_000).toLocaleString('en-US')}만`;
  }
  return `₩${Math.round(value).toLocaleString('en-US')}`;
}

function pct(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`;
}

function recommendationTone(recommendation: string): ImDeckMetric['tone'] {
  if (recommendation === 'Proceed To Committee') return 'good';
  if (recommendation === 'Proceed With Conditions') return 'warn';
  return 'bad';
}

const RECOMMENDATION_KO: Record<string, string> = {
  'Proceed To Committee': '심의 상정',
  'Proceed With Conditions': '조건부 상정',
  'Further Diligence Required': '추가 실사 필요'
};

export function imDeckFromReport(src: ImReportDeckSource): ImDeckInput {
  const recoKo = RECOMMENDATION_KO[src.recommendation] ?? src.recommendation;
  const thesis: string[] = [];
  if (src.upsideToBullPct !== null)
    thesis.push(`Bull 시나리오 상승여력 ${pct(src.upsideToBullPct)}`);
  if (src.downsideToBearPct !== null)
    thesis.push(`Bear 시나리오 하방 ${pct(src.downsideToBearPct)}`);
  if (src.minDscr !== null) thesis.push(`최저 DSCR ${src.minDscr.toFixed(2)}x`);
  thesis.push(`권고: ${recoKo}`);

  const metrics: ImDeckMetric[] = [
    { label: '기준 가치', value: krwCompact(src.baseValueKrw) },
    { label: 'Going-in 수익률', value: pct(src.goingInYieldPct), tone: 'good' },
    { label: 'Exit 캡레이트', value: pct(src.exitCapPct) },
    {
      label: '최저 DSCR',
      value: src.minDscr === null ? '—' : `${src.minDscr.toFixed(2)}x`,
      tone: src.minDscr !== null && src.minDscr >= 1.2 ? 'good' : 'warn'
    },
    {
      label: '신뢰도',
      value: src.confidenceScore === null ? '—' : `${src.confidenceScore.toFixed(1)} / 10`,
      tone: src.confidenceScore !== null && src.confidenceScore >= 7.5 ? 'good' : 'warn'
    },
    { label: '권고', value: recoKo, tone: recommendationTone(src.recommendation) }
  ];

  return {
    title: `${src.assetName} — 투자심의 메모(IM)`,
    subtitle: `${src.assetType} · ${src.market}`,
    confidentiality: '대외비 — 수신자 한정',
    footer: `${src.assetName} · Investment Memo`,
    sections: [
      { heading: '핵심 지표', metrics },
      {
        heading: '투자 논지 & 권고',
        body: `밸류에이션 신뢰도 ${src.confidenceScore === null ? '—' : `${src.confidenceScore.toFixed(1)}/10`} 기준 ${recoKo}.`,
        bullets: thesis
      }
    ]
  };
}
