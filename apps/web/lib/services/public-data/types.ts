/**
 * Shared schemas for public-data connectors that feed the property analyzer.
 * Each connector is swappable (mock now → real API later).
 *
 * Real source mapping:
 *   building-registry  → MOLIT 건축물대장 (Open API via 공공데이터포털)
 *   land-price         → MOLIT 공시지가, 국토교통부 실거래가
 *   use-zone           → VWorld / 토지이음 지적편집도
 *   grid-access        → KEPCO 전력계통도 + 변전소 위치
 *   rent-comps         → 한국부동산원 R-ONE / 국토교통부 실거래가 / 밸류맵 / 디스코
 */

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type ParcelIdentifier = {
  // Korean parcel number: e.g. "서울특별시 강남구 압구정동 458-7"
  jibunAddress: string;
  // PNU (19-digit parcel unique number) — stable join key across agencies
  pnu: string;
  // Road-name address: e.g. "서울특별시 강남구 압구정로 340"
  roadAddress: string | null;
};

export type BuildingRecord = {
  pnu: string;
  buildingName: string | null;
  mainUse: string;               // 주용도 e.g. "업무시설", "제2종근린생활시설"
  structure: string | null;      // 구조 e.g. "철근콘크리트"
  floorsAboveGround: number | null;
  floorsBelowGround: number | null;
  grossFloorAreaSqm: number | null;  // 연면적
  buildingAreaSqm: number | null;    // 건축면적
  landAreaSqm: number | null;        // 대지면적
  approvalYear: number | null;       // 사용승인년도
  elevatorCount: number | null;
  parkingCount: number | null;
  buildingCoveragePct: number | null; // 건폐율
  floorAreaRatioPct: number | null;   // 용적률
};

export type UseZone = {
  pnu: string;
  primaryZone: string;       // 용도지역 e.g. "제3종일반주거지역"
  specialDistrict: string | null;  // 용도지구
  urbanPlanFacility: string | null;
  zoningCode: KoreaZoningCode;     // enum form for routing
};

export type KoreaZoningCode =
  | 'RESIDENTIAL_1' | 'RESIDENTIAL_2' | 'RESIDENTIAL_3'
  | 'COMMERCIAL_CENTRAL' | 'COMMERCIAL_GENERAL' | 'COMMERCIAL_NEIGHBORHOOD' | 'COMMERCIAL_DISTRIBUTION'
  | 'INDUSTRIAL_EXCLUSIVE' | 'INDUSTRIAL_GENERAL' | 'INDUSTRIAL_QUASI'
  | 'GREEN_PRESERVATION' | 'GREEN_PRODUCTION' | 'GREEN_NATURAL'
  | 'MANAGEMENT_PLAN' | 'MANAGEMENT_PRODUCTION' | 'MANAGEMENT_CONSERVATION'
  | 'AGRICULTURE' | 'NATURE_RESERVE'
  | 'UNKNOWN';

export type LandPricing = {
  pnu: string;
  officialLandPriceKrwPerSqm: number;     // 공시지가 (current year)
  officialLandPriceYear: number;
  recentTransactionKrwPerSqm: number | null; // 실거래가 most recent
  recentTransactionDate: string | null;
  vacancyPct: number | null;              // market vacancy in micro-area
};

export type RentalComparable = {
  source: string;                         // e.g. "R-ONE 2025Q4"
  distanceKm: number;
  assetClassHint: 'OFFICE' | 'RETAIL' | 'LOGISTICS' | 'MULTIFAMILY' | 'DATA_CENTER' | 'MIXED_USE';
  monthlyRentKrwPerSqm: number | null;    // office/retail/multifamily
  monthlyRentKrwPerKw: number | null;     // data center
  capRatePct: number | null;
  occupancyPct: number | null;
  transactionDate: string | null;
  note: string | null;
};

export type GridAccess = {
  pnu: string;
  nearestSubstationName: string;
  nearestSubstationDistanceKm: number;
  availableCapacityMw: number | null;     // estimated remaining feeder capacity
  tariffKrwPerKwh: number;                // KEPCO industrial tariff (일반용 or 산업용)
  fiberBackboneAvailable: boolean;
  renewableSourcingAvailablePct: number | null;
};

export type MacroMicroSnapshot = {
  // Market context keyed to the micro-location (district-level)
  district: string;                       // 구/시
  metroRegion: string;                    // e.g. "수도권 남부"
  submarketVacancyPct: number | null;
  submarketRentGrowthPct: number | null;
  submarketCapRatePct: number | null;
  submarketInflationPct: number;
  constructionCostPerSqmKrw: number | null;
  notes: string;
};

// ---------------------------------------------------------------------------
// Connector interfaces — ready for real-API swap
// ---------------------------------------------------------------------------

export interface BuildingRegistryConnector {
  fetch(parcel: ParcelIdentifier): Promise<BuildingRecord | null>;
}

export interface UseZoneConnector {
  fetch(parcel: ParcelIdentifier): Promise<UseZone | null>;
}

export interface LandPricingConnector {
  fetch(parcel: ParcelIdentifier): Promise<LandPricing | null>;
}

export interface RentComparableConnector {
  fetch(
    location: LatLng,
    assetClass: RentalComparable['assetClassHint'],
    radiusKm: number
  ): Promise<RentalComparable[]>;
}

export interface GridAccessConnector {
  fetch(parcel: ParcelIdentifier, location: LatLng): Promise<GridAccess | null>;
}

export interface MacroMicroConnector {
  fetch(district: string, metroRegion: string): Promise<MacroMicroSnapshot>;
}

/**
 * Discrete sale transaction comp, typically sourced from 국토교통부 실거래가 (RTMS).
 * Used by 거래사례비교법 (sales comparison approach) in the valuation engine.
 */
export type TransactionComp = {
  source: string;
  /** 법정동 code (5-digit — sigungu) that was queried. */
  lawdCode: string;
  /** YYYY-MM-DD. */
  transactionDate: string;
  buildingName: string | null;
  /** Building gross floor area (연면적) in sqm. */
  gfaSqm: number | null;
  /** Land area (대지면적) in sqm. */
  landAreaSqm: number | null;
  /** Deal price in 만원 (MOLIT native unit). */
  dealAmountManWon: number;
  /** Derived: price per sqm in KRW. */
  pricePerSqmKrw: number | null;
  buildingUse: string | null;
  floor: number | null;
  buildYear: number | null;
};

export interface TransactionCompsConnector {
  /**
   * Fetch commercial property sale comps for a 시군구 within a given month range.
   * Returns empty array if the connector has no data or if the API key is missing.
   */
  fetch(params: {
    lawdCode: string;
    fromYyyyMm: string;
    toYyyyMm: string;
  }): Promise<TransactionComp[]>;
}
