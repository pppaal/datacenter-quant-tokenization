/**
 * Mock rent/cap comp connector.
 * Returns a small synthetic comp set per asset class, scaled to submarket tier.
 * Real source: 한국부동산원 R-ONE, 국토교통부 실거래가, 밸류맵, 디스코.
 */

import type {
  LatLng,
  RentComparableConnector,
  RentalComparable
} from '@/lib/services/public-data/types';

// Rough tier lookup via lat/lng bounding boxes for demo districts.
function submarketTier(loc: LatLng): 'TIER_1_GANGNAM' | 'TIER_1_CBD' | 'TIER_2_SEOUL' | 'TIER_3_METRO' | 'TIER_4_RURAL' {
  const { latitude: lat, longitude: lng } = loc;
  // Gangnam core (Apgujeong, Cheongdam, Sinsa, Yeoksam)
  if (lat >= 37.51 && lat <= 37.54 && lng >= 127.01 && lng <= 127.07) return 'TIER_1_GANGNAM';
  // CBD (Yeouido, Gwanghwamun, Jongno, Jamsil)
  if (lat >= 37.52 && lat <= 37.58 && lng >= 126.92 && lng <= 126.99) return 'TIER_1_CBD';
  if (lat >= 37.50 && lat <= 37.52 && lng >= 127.08 && lng <= 127.12) return 'TIER_1_CBD'; // Jamsil
  // Seoul rest
  if (lat >= 37.45 && lat <= 37.65 && lng >= 126.80 && lng <= 127.20) return 'TIER_2_SEOUL';
  // Metro (Gyeonggi, Incheon)
  if (lat >= 36.80 && lat <= 37.80 && lng >= 126.40 && lng <= 127.80) return 'TIER_3_METRO';
  return 'TIER_4_RURAL';
}

type CompTemplate = {
  rentOfficeKrwPerSqm: number;
  rentRetailKrwPerSqm: number;
  rentLogisticsKrwPerSqm: number;
  rentMultifamilyKrwPerSqm: number;
  rentDataCenterKrwPerKw: number;
  capOffice: number;
  capRetail: number;
  capLogistics: number;
  capMultifamily: number;
  capDataCenter: number;
};

const TIER_COMPS: Record<ReturnType<typeof submarketTier>, CompTemplate> = {
  TIER_1_GANGNAM: {
    rentOfficeKrwPerSqm: 145_000, rentRetailKrwPerSqm: 310_000, rentLogisticsKrwPerSqm: 28_000,
    rentMultifamilyKrwPerSqm: 95_000, rentDataCenterKrwPerKw: 280_000,
    capOffice: 4.6, capRetail: 4.2, capLogistics: 5.8, capMultifamily: 3.9, capDataCenter: 5.8
  },
  TIER_1_CBD: {
    rentOfficeKrwPerSqm: 132_000, rentRetailKrwPerSqm: 220_000, rentLogisticsKrwPerSqm: 26_000,
    rentMultifamilyKrwPerSqm: 82_000, rentDataCenterKrwPerKw: 260_000,
    capOffice: 4.8, capRetail: 4.5, capLogistics: 5.9, capMultifamily: 4.1, capDataCenter: 6.0
  },
  TIER_2_SEOUL: {
    rentOfficeKrwPerSqm: 95_000, rentRetailKrwPerSqm: 140_000, rentLogisticsKrwPerSqm: 22_000,
    rentMultifamilyKrwPerSqm: 62_000, rentDataCenterKrwPerKw: 220_000,
    capOffice: 5.4, capRetail: 5.2, capLogistics: 6.2, capMultifamily: 4.5, capDataCenter: 6.3
  },
  TIER_3_METRO: {
    rentOfficeKrwPerSqm: 58_000, rentRetailKrwPerSqm: 85_000, rentLogisticsKrwPerSqm: 14_000,
    rentMultifamilyKrwPerSqm: 38_000, rentDataCenterKrwPerKw: 180_000,
    capOffice: 6.2, capRetail: 6.0, capLogistics: 6.5, capMultifamily: 5.0, capDataCenter: 6.8
  },
  TIER_4_RURAL: {
    rentOfficeKrwPerSqm: 32_000, rentRetailKrwPerSqm: 48_000, rentLogisticsKrwPerSqm: 9_000,
    rentMultifamilyKrwPerSqm: 22_000, rentDataCenterKrwPerKw: 150_000,
    capOffice: 7.5, capRetail: 7.2, capLogistics: 7.0, capMultifamily: 5.8, capDataCenter: 7.5
  }
};

export class MockRentComps implements RentComparableConnector {
  async fetch(
    location: LatLng,
    assetClass: RentalComparable['assetClassHint'],
    _radiusKm: number
  ): Promise<RentalComparable[]> {
    const tier = submarketTier(location);
    const t = TIER_COMPS[tier];

    const rentField = {
      OFFICE: t.rentOfficeKrwPerSqm,
      RETAIL: t.rentRetailKrwPerSqm,
      LOGISTICS: t.rentLogisticsKrwPerSqm,
      MULTIFAMILY: t.rentMultifamilyKrwPerSqm,
      DATA_CENTER: null,
      MIXED_USE: t.rentOfficeKrwPerSqm
    }[assetClass];

    const rentKw = assetClass === 'DATA_CENTER' ? t.rentDataCenterKrwPerKw : null;

    const capRate = {
      OFFICE: t.capOffice,
      RETAIL: t.capRetail,
      LOGISTICS: t.capLogistics,
      MULTIFAMILY: t.capMultifamily,
      DATA_CENTER: t.capDataCenter,
      MIXED_USE: t.capOffice
    }[assetClass];

    // Return 3 comps with minor variation around the benchmark.
    const comps: RentalComparable[] = [];
    for (let i = 0; i < 3; i++) {
      const variance = 1 + (i - 1) * 0.07;
      comps.push({
        source: `${tier.replace('_', ' ')} 2025Q4 comp #${i + 1}`,
        distanceKm: 0.3 + i * 0.6,
        assetClassHint: assetClass,
        monthlyRentKrwPerSqm: rentField ? Math.round(rentField * variance) : null,
        monthlyRentKrwPerKw: rentKw ? Math.round(rentKw * variance) : null,
        capRatePct: Number((capRate * (1 + (i - 1) * 0.03)).toFixed(2)),
        occupancyPct: 85 + i,
        transactionDate: '2025-0' + (9 - i) + '-15',
        note: null
      });
    }
    return comps;
  }
}
