/**
 * Mock 용도지역 (use zone) connector.
 * Returns realistic zoning codes keyed off address district.
 * Replace with VWorld / 토지이음 API later.
 */

import type {
  ParcelIdentifier,
  UseZone,
  UseZoneConnector,
  KoreaZoningCode
} from '@/lib/services/public-data/types';

type DistrictRule = {
  match: RegExp;
  zone: KoreaZoningCode;
  primary: string;
  specialDistrict?: string;
};

// Realistic zoning knowledge — hand-curated for demo districts.
const DISTRICT_RULES: DistrictRule[] = [
  // Gangnam premium retail/commercial corridors
  { match: /압구정/, zone: 'COMMERCIAL_GENERAL', primary: '일반상업지역', specialDistrict: '압구정로데오 지구단위계획구역' },
  { match: /청담/, zone: 'COMMERCIAL_GENERAL', primary: '일반상업지역' },
  { match: /신사/, zone: 'COMMERCIAL_GENERAL', primary: '일반상업지역' },
  { match: /잠실/, zone: 'COMMERCIAL_CENTRAL', primary: '중심상업지역', specialDistrict: '잠실광역중심' },
  { match: /여의도/, zone: 'COMMERCIAL_CENTRAL', primary: '중심상업지역', specialDistrict: '국제금융지구' },
  { match: /광화문|종로/, zone: 'COMMERCIAL_CENTRAL', primary: '중심상업지역', specialDistrict: '도심부 지구단위계획구역' },
  { match: /역삼|테헤란/, zone: 'COMMERCIAL_GENERAL', primary: '일반상업지역', specialDistrict: '테헤란로 지구단위계획구역' },

  // Seoul semi-industrial
  { match: /성수/, zone: 'INDUSTRIAL_QUASI', primary: '준공업지역', specialDistrict: '성수IT산업개발진흥지구' },
  { match: /가산|구로디지털/, zone: 'INDUSTRIAL_QUASI', primary: '준공업지역', specialDistrict: 'G밸리' },
  { match: /영등포/, zone: 'INDUSTRIAL_QUASI', primary: '준공업지역' },
  { match: /강서(.*(마곡|공항))/, zone: 'INDUSTRIAL_QUASI', primary: '준공업지역', specialDistrict: '마곡지구' },

  // Logistics / DC belt
  { match: /평택.*(고덕|포승)/, zone: 'INDUSTRIAL_GENERAL', primary: '일반공업지역' },
  { match: /평택/, zone: 'MANAGEMENT_PLAN', primary: '계획관리지역' },
  { match: /파주.*(LCD|운정)/, zone: 'INDUSTRIAL_GENERAL', primary: '일반공업지역' },
  { match: /파주/, zone: 'MANAGEMENT_PLAN', primary: '계획관리지역' },
  { match: /안성|이천|용인.*(처인|원삼)/, zone: 'MANAGEMENT_PLAN', primary: '계획관리지역' },
  { match: /인천.*(송도|청라)/, zone: 'COMMERCIAL_GENERAL', primary: '일반상업지역', specialDistrict: '경제자유구역' },
  { match: /인천/, zone: 'INDUSTRIAL_GENERAL', primary: '일반공업지역' },

  // Residential Gangnam/Songpa (default)
  { match: /(대치|도곡|삼성동|서초)/, zone: 'RESIDENTIAL_3', primary: '제3종일반주거지역' },
  { match: /(반포|방배|잠원)/, zone: 'RESIDENTIAL_3', primary: '제3종일반주거지역' },

  // Hotel / tourism
  { match: /이태원|한남/, zone: 'COMMERCIAL_NEIGHBORHOOD', primary: '근린상업지역' },

  // Default Seoul residential
  { match: /서울/, zone: 'RESIDENTIAL_2', primary: '제2종일반주거지역' }
];

export class MockUseZone implements UseZoneConnector {
  async fetch(parcel: ParcelIdentifier): Promise<UseZone | null> {
    const addr = parcel.jibunAddress;
    for (const rule of DISTRICT_RULES) {
      if (rule.match.test(addr)) {
        return {
          pnu: parcel.pnu,
          primaryZone: rule.primary,
          specialDistrict: rule.specialDistrict ?? null,
          urbanPlanFacility: null,
          zoningCode: rule.zone
        };
      }
    }
    return {
      pnu: parcel.pnu,
      primaryZone: '제2종일반주거지역',
      specialDistrict: null,
      urbanPlanFacility: null,
      zoningCode: 'RESIDENTIAL_2'
    };
  }
}
