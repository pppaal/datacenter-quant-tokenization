/**
 * FX exposure summary for non-KRW LP investors. Korean assets carry
 * 100% KRW operating exposure; LPs reporting in USD / EUR / JPY
 * face translation risk on both income and exit. The IM card
 * surfaces the gross exposure, the headline KRW/<base> spot, and a
 * directional sensitivity (±10% currency moves) on the LP-base
 * value.
 *
 * No hedging instrument is modeled here — the IM displays the
 * unhedged exposure and notes that hedge ratio depends on LP-side
 * policy (typically forward-rolled or via deal-level NDF).
 */

export type FxSensitivityRow = {
  shockPct: number;
  baseCurrencyValue: number;
};

export type FxExposureSummary = {
  assetCurrency: string;
  lpBaseCurrency: string;
  spotRate: number;
  spotRateLabel: string;
  /** KRW value translated to LP base at spot. */
  baseValueAtSpot: number;
  sensitivity: FxSensitivityRow[];
  /** Direction-coded exposure note. */
  exposureBand: 'low' | 'moderate' | 'high';
  notes: string;
};

const FOREIGN_LP_BASES: Record<string, number> = {
  // Default rough translation rates as of seed; the IM renders the
  // value as illustrative and explicitly carries the spot label.
  USD: 1 / 1380,
  EUR: 1 / 1500,
  JPY: 1 / 9.1
};

export function buildFxExposure(
  assetValueKrw: number,
  options: {
    assetCurrency?: string;
    lpBaseCurrency?: string;
    spotRate?: number; // KRW per 1 unit of LP base
    spotRateLabel?: string;
  } = {}
): FxExposureSummary | null {
  const assetCurrency = options.assetCurrency ?? 'KRW';
  const lpBaseCurrency = options.lpBaseCurrency ?? 'USD';

  if (lpBaseCurrency === assetCurrency) return null;

  const spotKrwPerUnit =
    options.spotRate ??
    (FOREIGN_LP_BASES[lpBaseCurrency]
      ? 1 / FOREIGN_LP_BASES[lpBaseCurrency]!
      : 1380);

  const baseValueAtSpot = assetValueKrw / spotKrwPerUnit;
  const sensitivity: FxSensitivityRow[] = [-20, -10, 0, 10, 20].map((shock) => ({
    shockPct: shock,
    baseCurrencyValue: assetValueKrw / (spotKrwPerUnit * (1 + shock / 100))
  }));

  // Exposure band — Korea-only assets carry full operating-currency
  // mismatch for foreign LPs.
  const exposureBand: 'low' | 'moderate' | 'high' =
    assetCurrency === lpBaseCurrency
      ? 'low'
      : ['USD', 'EUR'].includes(lpBaseCurrency)
        ? 'high'
        : 'moderate';

  const notes =
    exposureBand === 'high'
      ? `100% ${assetCurrency} operating exposure for ${lpBaseCurrency}-base LPs. Hedging policy depends on LP-side mandate; deal-level NDF or forward roll typical for KR-asset commitments.`
      : `${assetCurrency}/${lpBaseCurrency} translation exposure carried at LP level. No deal-level hedge modeled.`;

  return {
    assetCurrency,
    lpBaseCurrency,
    spotRate: spotKrwPerUnit,
    spotRateLabel: options.spotRateLabel ?? `${spotKrwPerUnit.toFixed(0)} ${assetCurrency}/${lpBaseCurrency}`,
    baseValueAtSpot,
    sensitivity,
    exposureBand,
    notes
  };
}
