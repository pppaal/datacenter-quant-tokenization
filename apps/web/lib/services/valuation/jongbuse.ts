/**
 * 종합부동산세 (comprehensive real estate tax) estimator.
 *
 * Applies to Korean property holdings above statutory thresholds, assessed on
 * 공시가격 (officially published assessed value), not market price. For corporate
 * holders (우리가 가정하는 SPV/법인) the rules differ from individuals.
 *
 * Bracket rules used here (2024 기준, 법인 보유):
 *
 *  - 주택 (MULTIFAMILY, residential):
 *      법인 보유 주택은 공시가격에 **일률 2.7%** 를 적용 (조정지역 외). 개인과
 *      달리 기본공제가 없고 세율이 평탄하다. 조정지역 2주택 이상은 5.0% 이지만
 *      단일자산 SPV 가정이라 2.7% 로 본다.
 *
 *  - 별도합산토지 (OFFICE / RETAIL / HOTEL / DATA_CENTER / MIXED_USE 의 부속토지):
 *      공시가격 중 토지분에 대해 80억 공제 후 progressive:
 *        80억 초과 ~ 140억 : 0.5%
 *        140억 초과 ~ 280억 : 0.6%
 *        280억 초과        : 0.7%
 *      건물분은 종부세 대상이 아니고 재산세만 내므로 land 포션만 과세.
 *
 *  - 종합합산토지 (LAND, 나대지·잡종지):
 *      5억 공제 후 progressive:
 *        5억 초과 ~ 45억  : 1.0%
 *        45억 초과 ~ 95억 : 2.0%
 *        95억 초과        : 3.0%
 *
 *  - INDUSTRIAL 은 보통 사업용으로 분리과세 토지에 해당해 종부세 비과세. 안전하게
 *    0 으로 처리하되 `overrideAnnualKrw` 로 강제 지정 가능.
 *
 * `공시가격현실화율` 은 유형·지역별로 다르나 약 60~70% 범위. 본 모듈은 기본 0.65
 * 를 쓰고 옵션으로 override 허용.
 *
 * `공정시장가액비율` (fair-market-value ratio): 종부세 과세표준은 공시가격에서
 * 공제액을 뺀 뒤 다시 **공정시장가액비율** 을 곱해 산출한다 (종합부동산세법
 * §8·§13). 토지(종합·별도합산) 및 법인 주택은 약 60%. 기존 모듈은 재산세에는
 * 이 비율을 반영하면서 종부세에는 누락하여 과세표준을 과대계상했다. 본 수정에서
 * `fairMarketRatio` (기본 0.6) 를 과세표준에 곱해 보정한다. 주의: 공정시장가액
 * 비율은 공제 *이후* 과세표준에 적용된다 (법인 주택은 기본공제가 없어 공시가격
 * 전액 × 비율).
 *
 * 주의: 이 모듈은 underwriting-level 추정치이지 세무 의견서가 아님. 실거래 들어갈
 * 때는 공시가격을 직접 조회하고 세무법인 검토를 받아야 한다.
 */

export type JongbuseInputs = {
  assetClass: string;
  purchasePriceKrw: number;
  landValuePct: number;
  assessmentRatio?: number;
  /**
   * 공정시장가액비율. Applied to the taxable base AFTER the statutory deduction
   * (토지) or to the assessed value (법인 주택, which has no basic deduction).
   *
   * Defaults to 1 (no-op) so the standalone module's historical contract is
   * preserved; the underwriting path (synthetic-pro-forma.ts) explicitly passes
   * the statutory ~0.6 ratio (`DEFAULT_FAIR_MARKET_RATIO`) so 종부세 과세표준 is
   * correctly haircut there. Pass 0.6 here to model the real base directly.
   */
  fairMarketRatio?: number;
  overrideAnnualKrw?: number;
};

export type JongbuseResult = {
  annualJongbuseKrw: number;
  assessedValueKrw: number;
  taxableBasisKrw: number;
  method: 'RESIDENTIAL_CORP' | 'SEPARATE_LAND' | 'GENERAL_LAND' | 'EXEMPT' | 'OVERRIDE';
  note: string;
};

const RESIDENTIAL_CORP_RATE_PCT = 2.7;

/** 공정시장가액비율 default for 토지·법인 주택 (2024). Applied to the taxable base. */
export const DEFAULT_FAIR_MARKET_RATIO = 0.6;

type ProgressiveBracket = { upperKrw: number | null; ratePct: number };

const SEPARATE_LAND_EXEMPTION_KRW = 8_000_000_000;
const SEPARATE_LAND_BRACKETS: ProgressiveBracket[] = [
  { upperKrw: 6_000_000_000, ratePct: 0.5 },
  { upperKrw: 14_000_000_000, ratePct: 0.6 },
  { upperKrw: null, ratePct: 0.7 }
];

const GENERAL_LAND_EXEMPTION_KRW = 500_000_000;
const GENERAL_LAND_BRACKETS: ProgressiveBracket[] = [
  { upperKrw: 4_000_000_000, ratePct: 1.0 },
  { upperKrw: 5_000_000_000, ratePct: 2.0 },
  { upperKrw: null, ratePct: 3.0 }
];

function applyProgressive(taxableKrw: number, brackets: ProgressiveBracket[]): number {
  if (taxableKrw <= 0) return 0;
  let remaining = taxableKrw;
  let tax = 0;
  for (const bracket of brackets) {
    const slice = bracket.upperKrw == null ? remaining : Math.min(remaining, bracket.upperKrw);
    tax += slice * (bracket.ratePct / 100);
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export function computeAnnualJongbuseKrw(inputs: JongbuseInputs): JongbuseResult {
  const {
    assetClass,
    purchasePriceKrw,
    landValuePct,
    assessmentRatio = 0.65,
    // Default 1 (identity) keeps the standalone module backward-compatible;
    // synthetic-pro-forma supplies DEFAULT_FAIR_MARKET_RATIO (0.6) explicitly.
    fairMarketRatio = 1,
    overrideAnnualKrw
  } = inputs;

  if (overrideAnnualKrw != null) {
    return {
      annualJongbuseKrw: Math.max(0, Math.round(overrideAnnualKrw)),
      assessedValueKrw: 0,
      taxableBasisKrw: 0,
      method: 'OVERRIDE',
      note: '종부세 수기 입력값 사용'
    };
  }

  const assessedValueKrw = Math.round(purchasePriceKrw * assessmentRatio);

  if (assetClass === 'MULTIFAMILY') {
    // 법인 주택은 기본공제 없음 → 공시가격 전액 × 공정시장가액비율 = 과세표준.
    const taxableBasis = Math.round(assessedValueKrw * fairMarketRatio);
    return {
      annualJongbuseKrw: Math.round(taxableBasis * (RESIDENTIAL_CORP_RATE_PCT / 100)),
      assessedValueKrw,
      taxableBasisKrw: taxableBasis,
      method: 'RESIDENTIAL_CORP',
      note: `법인 보유 주택 공시가격 × 공정시장가액비율 ${fairMarketRatio} 에 ${RESIDENTIAL_CORP_RATE_PCT}% 일률 적용`
    };
  }

  if (assetClass === 'INDUSTRIAL') {
    return {
      annualJongbuseKrw: 0,
      assessedValueKrw,
      taxableBasisKrw: 0,
      method: 'EXEMPT',
      note: '사업용 분리과세 토지 가정 — 종부세 비과세'
    };
  }

  if (assetClass === 'LAND') {
    const landAssessed = Math.round(assessedValueKrw * (landValuePct / 100));
    // 과세표준 = (공시가격 토지분 − 공제) × 공정시장가액비율.
    const taxable = Math.round(
      Math.max(0, landAssessed - GENERAL_LAND_EXEMPTION_KRW) * fairMarketRatio
    );
    return {
      annualJongbuseKrw: applyProgressive(taxable, GENERAL_LAND_BRACKETS),
      assessedValueKrw,
      taxableBasisKrw: taxable,
      method: 'GENERAL_LAND',
      note: `종합합산토지 — 5억 공제 후 공정시장가액비율 ${fairMarketRatio}, 1.0~3.0% progressive`
    };
  }

  // OFFICE / RETAIL / HOTEL / DATA_CENTER / MIXED_USE — 별도합산토지
  const landAssessed = Math.round(assessedValueKrw * (landValuePct / 100));
  // 과세표준 = (공시가격 토지분 − 80억 공제) × 공정시장가액비율.
  const taxable = Math.round(
    Math.max(0, landAssessed - SEPARATE_LAND_EXEMPTION_KRW) * fairMarketRatio
  );
  return {
    annualJongbuseKrw: applyProgressive(taxable, SEPARATE_LAND_BRACKETS),
    assessedValueKrw,
    taxableBasisKrw: taxable,
    method: 'SEPARATE_LAND',
    note: `별도합산토지 — 80억 공제 후 공정시장가액비율 ${fairMarketRatio}, 0.5~0.7% progressive (건물분 제외)`
  };
}
