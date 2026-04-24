import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { assembleBundle } from '@/lib/services/property-analyzer/bundle-assembler';
import type {
  BuildingRecord,
  GridAccess,
  LandPricing,
  MacroMicroSnapshot,
  ParcelIdentifier,
  RentalComparable,
  UseZone
} from '@/lib/services/public-data/types';

function fixtureParcel(): ParcelIdentifier {
  return {
    jibunAddress: '서울특별시 강남구 테헤란동 100-1',
    roadAddress: '서울특별시 강남구 테헤란로 100',
    pnu: '1168010500101000001'
  };
}

function fixtureBuilding(): BuildingRecord {
  return {
    pnu: '1168010500101000001',
    buildingName: 'Teheran Tower',
    mainUse: '업무시설',
    structure: '철근콘크리트',
    floorsAboveGround: 20,
    floorsBelowGround: 5,
    grossFloorAreaSqm: 30000,
    buildingAreaSqm: 1500,
    landAreaSqm: 2500,
    approvalYear: 2010,
    elevatorCount: 10,
    parkingCount: 200,
    buildingCoveragePct: 60,
    floorAreaRatioPct: 1000
  };
}

function fixtureZone(): UseZone {
  return {
    pnu: '1168010500101000001',
    primaryZone: '일반상업지역',
    specialDistrict: null,
    urbanPlanFacility: null,
    zoningCode: 'COMMERCIAL_GENERAL'
  };
}

function fixtureLandPricing(): LandPricing {
  return {
    pnu: '1168010500101000001',
    officialLandPriceKrwPerSqm: 30_000_000,
    officialLandPriceYear: 2026,
    recentTransactionKrwPerSqm: 50_000_000,
    recentTransactionDate: '2025-09-15',
    vacancyPct: 5
  };
}

function fixtureGrid(): GridAccess {
  return {
    pnu: '1168010500101000001',
    nearestSubstationName: '강남변전소',
    nearestSubstationDistanceKm: 1.2,
    availableCapacityMw: 15,
    tariffKrwPerKwh: 155,
    fiberBackboneAvailable: true,
    renewableSourcingAvailablePct: 20
  };
}

function fixtureMacro(): MacroMicroSnapshot {
  return {
    district: '강남구',
    metroRegion: '서울 강남권',
    submarketVacancyPct: 5,
    submarketRentGrowthPct: 3.5,
    submarketCapRatePct: 4.8,
    submarketInflationPct: 2.2,
    constructionCostPerSqmKrw: 4_200_000,
    notes: 'Gangnam core — steady absorption, low vacancy.'
  };
}

function fixtureComps(hint: RentalComparable['assetClassHint']): RentalComparable[] {
  return [
    {
      source: 'R-ONE 2025Q4',
      distanceKm: 0.5,
      assetClassHint: hint,
      monthlyRentKrwPerSqm: 38_000,
      monthlyRentKrwPerKw: null,
      capRatePct: 4.7,
      occupancyPct: 95,
      transactionDate: '2025-10-01',
      note: null
    },
    {
      source: 'R-ONE 2025Q4',
      distanceKm: 0.8,
      assetClassHint: hint,
      monthlyRentKrwPerSqm: 42_000,
      monthlyRentKrwPerKw: null,
      capRatePct: 4.9,
      occupancyPct: 93,
      transactionDate: '2025-08-10',
      note: null
    }
  ];
}

const BASE_INPUT = {
  addressInput: '서울특별시 강남구 테헤란로 100',
  parcel: fixtureParcel(),
  location: { latitude: 37.505, longitude: 127.054 },
  districtName: '강남구',
  building: fixtureBuilding(),
  zone: fixtureZone(),
  landPricing: fixtureLandPricing(),
  grid: fixtureGrid(),
  rentComps: fixtureComps('OFFICE'),
  macroMicro: fixtureMacro(),
  assetClass: AssetClass.OFFICE
};

test('assembleBundle produces an asset with purchase price derived from land + replacement', () => {
  const bundle = assembleBundle(BASE_INPUT);
  assert.ok(bundle.asset.purchasePriceKrw);
  // Land 2500sqm × 50M = 125B + replacement 30000×4.2M×~0.76 = ~95B → somewhere > 100B
  assert.ok(bundle.asset.purchasePriceKrw! > 100_000_000_000);
  assert.equal(bundle.asset.assetClass, AssetClass.OFFICE);
  assert.equal(bundle.asset.market, 'KR');
});

test('assembleBundle: DC asset class applies 1.7x construction premium to capex', () => {
  const office = assembleBundle(BASE_INPUT);
  const dc = assembleBundle({
    ...BASE_INPUT,
    assetClass: AssetClass.DATA_CENTER,
    rentComps: fixtureComps('DATA_CENTER').map((c) => ({
      ...c,
      monthlyRentKrwPerSqm: null,
      monthlyRentKrwPerKw: 250_000
    }))
  });
  assert.ok(dc.asset.capexAssumptionKrw! > office.asset.capexAssumptionKrw!);
  assert.ok(dc.asset.targetItLoadMw && dc.asset.targetItLoadMw > 0);
  assert.equal(dc.asset.financingLtvPct, 55);
  assert.equal(office.asset.financingLtvPct, 60);
});

test('assembleBundle: marketSnapshot carries sourceUpdatedAt (required for macro regime)', () => {
  const bundle = assembleBundle(BASE_INPUT);
  const ms = bundle.marketSnapshot as unknown as { sourceUpdatedAt: Date; updatedAt: Date };
  assert.ok(ms.sourceUpdatedAt instanceof Date);
  assert.ok(!Number.isNaN(ms.sourceUpdatedAt.getTime()));
});

test('assembleBundle: rent comps flow through unchanged in count and content', () => {
  const bundle = assembleBundle(BASE_INPUT);
  const comps = bundle.rentComps ?? [];
  assert.equal(comps.length, 2);
  const first = comps[0] as unknown as { monthlyRentKrwPerSqm: number };
  assert.equal(first.monthlyRentKrwPerSqm, 38_000);
});

test('assembleBundle: null building still produces a valid bundle (screening stage)', () => {
  const bundle = assembleBundle({ ...BASE_INPUT, building: null });
  assert.equal(bundle.asset.stage, 'SCREENING');
  assert.equal(bundle.buildingSnapshot, null);
  assert.equal(bundle.asset.grossFloorAreaSqm, null);
});
