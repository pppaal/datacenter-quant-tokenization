import {
  AssetClass,
  type MarketIndicatorSeries,
  type RentComp,
  type TransactionComp
} from '@prisma/client';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

type IncomeMarketEvidence = {
  transactionCompCount: number;
  rentCompCount: number;
  indicatorCount: number;
  averageTransactionPricePerSqmKrw: number | null;
  averageCapRatePct: number | null;
  averageMonthlyRentPerSqmKrw: number | null;
  averageOccupancyPct: number | null;
  averageRentGrowthPct: number | null;
};

function average(values: Array<number | null | undefined>) {
  const normalized = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (normalized.length === 0) return null;
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function transactionPricePerSqm(comp: TransactionComp) {
  if (typeof comp.pricePerSqmKrw === 'number') return comp.pricePerSqmKrw;
  return null;
}

function rentPerSqm(assetClass: AssetClass, comp: RentComp) {
  if (assetClass === AssetClass.DATA_CENTER) return null;
  return typeof comp.monthlyRentPerSqmKrw === 'number' ? comp.monthlyRentPerSqmKrw : null;
}

function indicatorValue(
  indicators: MarketIndicatorSeries[],
  keyMatches: string[],
  transform?: (value: number) => number
) {
  return average(
    indicators
      .filter((indicator) =>
        keyMatches.some((match) => indicator.indicatorKey.toLowerCase() === match.toLowerCase())
      )
      .map((indicator) => (transform ? transform(indicator.value ?? 0) : indicator.value))
  );
}

export function buildIncomeMarketEvidence(
  bundle: UnderwritingBundle,
  assetClass: AssetClass
): IncomeMarketEvidence {
  const transactionComps = bundle.transactionComps ?? [];
  const rentComps = bundle.rentComps ?? [];
  const indicators = bundle.marketIndicatorSeries ?? [];

  const averageTransactionPricePerSqmKrw = average(transactionComps.map(transactionPricePerSqm));
  const averageCapRatePct =
    average(transactionComps.map((comp) => comp.capRatePct)) ??
    indicatorValue(indicators, ['cap_rate_pct', 'market_cap_rate', 'cap_rate']);
  const averageMonthlyRentPerSqmKrw =
    average(rentComps.map((comp) => rentPerSqm(assetClass, comp))) ??
    indicatorValue(indicators, [
      'monthly_rent_per_sqm_krw',
      'market_rent_per_sqm_krw',
      'rent_per_sqm_krw'
    ]);
  const averageOccupancyPct =
    average(rentComps.map((comp) => comp.occupancyPct)) ??
    indicatorValue(indicators, ['occupancy_pct', 'market_occupancy_pct']) ??
    indicatorValue(indicators, ['vacancy_pct', 'market_vacancy_pct'], (value) => 100 - value);
  const averageRentGrowthPct = indicatorValue(indicators, [
    'rent_growth_pct',
    'market_rent_growth_pct',
    'rent_growth'
  ]);

  return {
    transactionCompCount: transactionComps.length,
    rentCompCount: rentComps.length,
    indicatorCount: indicators.length,
    averageTransactionPricePerSqmKrw,
    averageCapRatePct,
    averageMonthlyRentPerSqmKrw,
    averageOccupancyPct,
    averageRentGrowthPct
  };
}
