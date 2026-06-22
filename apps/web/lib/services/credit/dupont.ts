/**
 * DuPont ROE decomposition + earnings-quality (accruals) checks.
 *
 * These are standard institutional equity/credit-analysis lenses that the
 * existing credit module (`insights.ts`) did not cover:
 *
 *  - DuPont: ROE = 순이익률 (net margin) × 자산회전율 (asset turnover) ×
 *    재무레버리지 (equity multiplier). For real estate the turnover term is
 *    structurally tiny and leverage usually does the heavy lifting, so making
 *    the levers explicit tells the reader *why* the ROE is what it is — and
 *    flags ROE that is propped up by balance-sheet leverage rather than
 *    operating performance.
 *  - Earnings quality: operating cash flow vs reported net income. A large
 *    accrual gap (OCF well below NI) is the classic earnings-quality / accounting
 *    aggressiveness signal.
 *
 * Pure functions over already-coerced numbers (KRW). Null-safe: any missing or
 * non-positive denominator collapses the dependent metric to null rather than
 * emitting NaN/Infinity.
 */
import { round } from '@/lib/math';

export type DupontInput = {
  netIncome: number | null;
  revenue: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
};

export type DupontResult = {
  /** netIncome / revenue, in %. */
  netMarginPct: number | null;
  /** revenue / totalAssets, as a multiple (turns per period). */
  assetTurnover: number | null;
  /** totalAssets / totalEquity, as a multiple. */
  equityMultiplier: number | null;
  /** netIncome / totalEquity, in % — computed directly (not the rounded product). */
  roePct: number | null;
  /**
   * Which lever dominates the ROE story. 'leverage' when the equity multiplier
   * is the only thing keeping ROE positive (thin/negative operating returns
   * geared up); 'operating' when the unlevered return on assets already carries
   * it; null when ROE is not computable.
   */
  driver: 'operating' | 'leverage' | 'balanced' | null;
  headline: string | null;
};

/**
 * Three-step DuPont. ROE is computed directly from netIncome/equity so it stays
 * exact; the three factors are reported alongside for attribution (their rounded
 * product will approximate, not equal, the reported ROE).
 */
export function dupontDecomposition(input: DupontInput): DupontResult {
  const { netIncome, revenue, totalAssets, totalEquity } = input;

  const netMarginPct =
    netIncome !== null && revenue !== null && revenue > 0
      ? round((netIncome / revenue) * 100, 1)
      : null;
  const assetTurnover =
    revenue !== null && totalAssets !== null && totalAssets > 0
      ? round(revenue / totalAssets, 3)
      : null;
  const equityMultiplier =
    totalAssets !== null && totalEquity !== null && totalEquity > 0
      ? round(totalAssets / totalEquity, 2)
      : null;
  const roePct =
    netIncome !== null && totalEquity !== null && totalEquity > 0
      ? round((netIncome / totalEquity) * 100, 1)
      : null;

  if (roePct === null) {
    return {
      netMarginPct,
      assetTurnover,
      equityMultiplier,
      roePct: null,
      driver: null,
      headline: null
    };
  }

  // Return on assets (unlevered) vs ROE (levered). The gap is the leverage lift.
  const roaPct =
    netIncome !== null && totalAssets !== null && totalAssets > 0
      ? (netIncome / totalAssets) * 100
      : null;

  let driver: DupontResult['driver'] = 'balanced';
  if (roaPct !== null) {
    const lift = roePct - roaPct; // leverage contribution (pp)
    if (roaPct <= 0 && roePct > 0) {
      // Operating return is flat/negative; only gearing makes ROE positive.
      driver = 'leverage';
    } else if (Math.abs(lift) > Math.abs(roaPct)) {
      // Leverage adds more than the asset return itself.
      driver = 'leverage';
    } else if (Math.abs(lift) < Math.abs(roaPct) * 0.25) {
      driver = 'operating';
    }
  }

  const factorStr =
    netMarginPct !== null && assetTurnover !== null && equityMultiplier !== null
      ? ` = 순이익률 ${netMarginPct}% × 자산회전율 ${assetTurnover}× × 재무레버리지 ${equityMultiplier}×`
      : '';
  const driverNote =
    driver === 'leverage'
      ? ' — ROE를 재무레버리지가 견인 (영업 자산수익률 취약)'
      : driver === 'operating'
        ? ' — ROE를 영업수익성이 견인'
        : '';
  const headline = `ROE ${roePct}%${factorStr}${driverNote}`;

  return { netMarginPct, assetTurnover, equityMultiplier, roePct, driver, headline };
}

export type EarningsQualityInput = {
  operatingCashFlow: number | null;
  netIncome: number | null;
};

export type EarningsQualityResult = {
  /** operatingCashFlow / netIncome, as a multiple (cash backing of earnings). */
  ocfToNi: number | null;
  /** (netIncome − operatingCashFlow) / |netIncome|, in % — the accrual share. */
  accrualRatioPct: number | null;
  classification: 'strong' | 'adequate' | 'weak' | 'n/a';
  /** Set only when the signal is worth surfacing (weak quality). */
  flag: string | null;
  headline: string | null;
};

/**
 * Earnings quality from the cash-vs-accrual gap. Only meaningful when net income
 * is positive (the accrual ratio is undefined/ambiguous for losses), so a
 * non-positive NI returns classification 'n/a' but still reports OCF context.
 */
export function earningsQuality(input: EarningsQualityInput): EarningsQualityResult {
  const { operatingCashFlow, netIncome } = input;

  if (operatingCashFlow === null || netIncome === null) {
    return {
      ocfToNi: null,
      accrualRatioPct: null,
      classification: 'n/a',
      flag: null,
      headline: null
    };
  }

  if (netIncome <= 0) {
    // Loss-making: accrual ratio is not informative; report cash posture only.
    const headline =
      operatingCashFlow > 0
        ? `적자에도 영업현금흐름은 (+) — 발생액 판정 보류`
        : `적자 + 영업현금흐름 (−) — 현금 소진`;
    return {
      ocfToNi: null,
      accrualRatioPct: null,
      classification: 'n/a',
      flag: operatingCashFlow <= 0 ? '적자 + 영업현금흐름 (−)' : null,
      headline
    };
  }

  const ocfToNi = round(operatingCashFlow / netIncome, 2);
  const accrualRatioPct = round(((netIncome - operatingCashFlow) / Math.abs(netIncome)) * 100, 1);

  let classification: EarningsQualityResult['classification'];
  if (ocfToNi >= 1) classification = 'strong';
  else if (ocfToNi >= 0.5) classification = 'adequate';
  else classification = 'weak';

  const flag =
    classification === 'weak'
      ? `이익의 질 낮음 — 영업현금흐름이 순이익의 ${Math.round(ocfToNi * 100)}%`
      : null;
  const headline =
    classification === 'strong'
      ? `이익의 질 양호 — 영업현금흐름이 순이익의 ${Math.round(ocfToNi * 100)}% (발생액 ${accrualRatioPct}%)`
      : classification === 'adequate'
        ? `이익의 질 보통 — OCF/순이익 ${ocfToNi}× (발생액 ${accrualRatioPct}%)`
        : `이익의 질 낮음 — OCF/순이익 ${ocfToNi}× (발생액 ${accrualRatioPct}%)`;

  return { ocfToNi, accrualRatioPct, classification, flag, headline };
}

export type StatementQualityInput = {
  label: string;
  netIncome: number | null;
  revenue: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  operatingCashFlow: number | null;
};

export type StatementQualityInsights = {
  /** The latest period the metrics were computed for. */
  period: string | null;
  dupont: DupontResult;
  earningsQuality: EarningsQualityResult;
};

/**
 * Build DuPont + earnings-quality for the most recent period in a set of
 * comparative periods. `periods` is expected newest-first (matching
 * `fromAssetStatements`, which is ordered fiscalYear desc), but we don't rely on
 * ordering — we take element 0 as "latest" the same way the rest of the panel
 * does. Returns empty/null metrics when there are no periods.
 */
export function buildStatementQualityInsights(
  periods: StatementQualityInput[]
): StatementQualityInsights {
  const latest = periods[0];
  if (!latest) {
    return {
      period: null,
      dupont: {
        netMarginPct: null,
        assetTurnover: null,
        equityMultiplier: null,
        roePct: null,
        driver: null,
        headline: null
      },
      earningsQuality: {
        ocfToNi: null,
        accrualRatioPct: null,
        classification: 'n/a',
        flag: null,
        headline: null
      }
    };
  }
  return {
    period: latest.label,
    dupont: dupontDecomposition({
      netIncome: latest.netIncome,
      revenue: latest.revenue,
      totalAssets: latest.totalAssets,
      totalEquity: latest.totalEquity
    }),
    earningsQuality: earningsQuality({
      operatingCashFlow: latest.operatingCashFlow,
      netIncome: latest.netIncome
    })
  };
}
