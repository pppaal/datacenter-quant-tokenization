import {
  decomposeCapRate,
  estimateSubmarketSpread,
  type CapRateDecomposition
} from '@/lib/services/research/cap-rate-decomposition';

type AssetLike = {
  assetClass: string;
  market?: string | null;
  address?: { district?: string | null } | null;
  macroSeries?: Array<{ seriesKey: string; value: number }> | null;
  transactionComps?: Array<{ region?: string | null; capRatePct?: number | null }> | null;
  buildingRecords?: Array<{ completionDate?: Date | string | null }> | null;
};

/**
 * Assemble the cap-rate build-up for an asset from its macro series + comps,
 * mirroring the sample-report wiring so the decomposition can render on the
 * asset/valuation pages too. Returns null when the macro anchor (base rate)
 * is unavailable.
 *
 * NOTE: the risk-free leg prefers a 10Y govt-bond series (`gov_yield_10y_pct`)
 * and falls back to the BOK base rate (`policy_rate_pct`) until that series is
 * ingested — see the macro-connector backlog.
 */
export function buildAssetCapRateDecomposition(asset: AssetLike): CapRateDecomposition | null {
  const macroByKey: Record<string, number> = {};
  for (const point of asset.macroSeries ?? []) {
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      macroByKey[point.seriesKey] = point.value;
    }
  }
  if (typeof macroByKey.policy_rate_pct !== 'number') return null;

  const submarketSpread = estimateSubmarketSpread({
    comps: (asset.transactionComps ?? []).map((comp) => ({
      submarket: comp.region ?? null,
      capRatePct: comp.capRatePct ?? null
    })),
    targetSubmarket: asset.address?.district ?? asset.market ?? 'KR',
    minComps: 3
  });

  const referenceYear = new Date().getFullYear();
  const completion = asset.buildingRecords?.[0]?.completionDate;

  return decomposeCapRate({
    riskFreeRatePct: macroByKey.gov_yield_10y_pct ?? macroByKey.policy_rate_pct,
    equityRiskPremiumPct: 5.0,
    sectorBeta:
      asset.assetClass === 'DATA_CENTER' ? 0.45 : asset.assetClass === 'OFFICE' ? 0.6 : 0.5,
    submarketSpreadPct: submarketSpread.spreadPct,
    growthExpectationPct:
      (macroByKey.rent_growth_pct ?? 0) +
      (macroByKey.inflation_pct ? macroByKey.inflation_pct * 0.5 : 0),
    transactionVolumeIndex: macroByKey.transaction_volume_index ?? 100,
    vintageYear: completion ? new Date(completion).getFullYear() : referenceYear,
    referenceYear
  });
}

/** Whether the risk-free leg used the true 10Y series vs the base-rate proxy. */
export function capRateUsesPolicyRateProxy(asset: Pick<AssetLike, 'macroSeries'>): boolean {
  const has10y = (asset.macroSeries ?? []).some(
    (point) => point.seriesKey === 'gov_yield_10y_pct' && Number.isFinite(point.value)
  );
  return !has10y;
}
