/**
 * Mock 공시지가 (official land price) + 실거래가 connector.
 * Realistic 2026 KRW/sqm values by district.
 * Real source: MOLIT 실거래가 공개시스템 + 국토교통부 공시지가.
 */

import type {
  LandPricing,
  LandPricingConnector,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

// 2026 estimated official land prices (KRW/sqm), rough but directionally accurate.
// These reflect real tier-1 Korean submarket pricing.
const DISTRICT_BENCHMARKS: Array<{
  match: RegExp;
  official: number;
  market: number;
  vacancy: number;
}> = [
  { match: /압구정로데오|청담명품거리/, official: 45_000_000, market: 75_000_000, vacancy: 3.0 },
  { match: /압구정/, official: 32_000_000, market: 55_000_000, vacancy: 3.5 },
  { match: /청담/, official: 28_000_000, market: 48_000_000, vacancy: 4.0 },
  { match: /신사/, official: 22_000_000, market: 38_000_000, vacancy: 4.0 },
  { match: /잠실/, official: 20_000_000, market: 34_000_000, vacancy: 5.5 },
  { match: /역삼|테헤란/, official: 26_000_000, market: 45_000_000, vacancy: 6.0 },
  { match: /여의도/, official: 24_000_000, market: 40_000_000, vacancy: 7.2 },
  { match: /광화문|종로|을지로/, official: 22_000_000, market: 36_000_000, vacancy: 6.8 },
  { match: /성수/, official: 14_000_000, market: 25_000_000, vacancy: 5.0 },
  { match: /가산|구로디지털/, official: 9_500_000, market: 16_000_000, vacancy: 8.5 },
  { match: /영등포/, official: 10_500_000, market: 17_000_000, vacancy: 7.0 },
  { match: /마곡/, official: 11_000_000, market: 18_000_000, vacancy: 6.2 },
  { match: /강서/, official: 8_500_000, market: 14_000_000, vacancy: 7.0 },
  { match: /송도|청라/, official: 7_200_000, market: 11_500_000, vacancy: 10.5 },
  { match: /평택.*(고덕|포승)/, official: 1_800_000, market: 2_800_000, vacancy: 12.0 },
  { match: /평택/, official: 900_000, market: 1_400_000, vacancy: 14.0 },
  { match: /파주/, official: 780_000, market: 1_200_000, vacancy: 11.0 },
  { match: /안성/, official: 520_000, market: 820_000, vacancy: 13.0 },
  { match: /이천/, official: 640_000, market: 1_050_000, vacancy: 10.0 },
  { match: /용인.*(처인|원삼)/, official: 820_000, market: 1_350_000, vacancy: 9.5 },
  { match: /인천/, official: 4_200_000, market: 6_800_000, vacancy: 8.0 },
  { match: /서울/, official: 8_000_000, market: 13_000_000, vacancy: 5.5 }
];

export class MockLandPricing implements LandPricingConnector {
  async fetch(parcel: ParcelIdentifier): Promise<LandPricing | null> {
    const addr = parcel.jibunAddress;
    const bench = DISTRICT_BENCHMARKS.find((b) => b.match.test(addr)) ?? {
      official: 2_000_000,
      market: 3_200_000,
      vacancy: 9.0
    };

    return {
      pnu: parcel.pnu,
      officialLandPriceKrwPerSqm: bench.official,
      officialLandPriceYear: 2026,
      recentTransactionKrwPerSqm: bench.market,
      recentTransactionDate: '2025-11',
      vacancyPct: bench.vacancy
    };
  }
}
