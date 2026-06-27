import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import {
  buildAnalysisProvenance,
  ESTIMATED_TIERS,
  type ProvenanceTier
} from '@/lib/services/property-analyzer/bundle-assembler';
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

function macroWithEvidence(): MacroMicroSnapshot {
  return {
    district: '강남구',
    metroRegion: '서울 강남권',
    submarketVacancyPct: 5,
    submarketRentGrowthPct: 3.5,
    submarketCapRatePct: 4.8,
    submarketInflationPct: 2.2,
    constructionCostPerSqmKrw: 4_200_000,
    notes: 'Gangnam core.'
  };
}

function macroNoEvidence(): MacroMicroSnapshot {
  return {
    district: '강남구',
    metroRegion: '서울 강남권',
    submarketVacancyPct: null,
    submarketRentGrowthPct: null,
    submarketCapRatePct: null,
    submarketInflationPct: 2.2,
    constructionCostPerSqmKrw: null,
    notes: 'Thin market.'
  };
}

function richComps(): RentalComparable[] {
  return [
    {
      source: 'R-ONE 2025Q4',
      distanceKm: 0.5,
      assetClassHint: 'OFFICE',
      monthlyRentKrwPerSqm: 38_000,
      monthlyRentKrwPerKw: null,
      capRatePct: 4.7,
      occupancyPct: 95,
      transactionDate: '2025-10-01',
      note: null
    }
  ];
}

function field(prov: ReturnType<typeof buildAnalysisProvenance>, key: string) {
  const f = prov.fields.find((x) => x.field === key);
  assert.ok(f, `expected provenance field "${key}"`);
  return f!;
}

// ---------------------------------------------------------------------------
// Poor bundle: mock geocode, no comps, no deposit/land/cap evidence.
// ---------------------------------------------------------------------------

test('provenance flags fallbacks: no comps, mock geocode, no land/cap/occupancy data', () => {
  const prov = buildAnalysisProvenance(
    {
      addressInput: '?',
      parcel: fixtureParcel(),
      location: { latitude: 37.5, longitude: 127.0 },
      districtName: '강남구',
      building: fixtureBuilding(),
      zone: fixtureZone(),
      landPricing: null,
      grid: fixtureGrid(),
      rentComps: [],
      macroMicro: macroNoEvidence(),
      assetClass: AssetClass.OFFICE
    },
    {
      mockGeocode: true,
      connectorModes: {
        useZone: 'mock',
        landPricing: 'mock',
        rentComps: 'mock',
        macroMicro: 'mock'
      },
      connectorFailures: [{ label: 'rent-comps-primary', message: 'timeout' }]
    }
  );

  assert.equal(field(prov, 'geocode').tier, 'MOCK' satisfies ProvenanceTier);
  assert.equal(field(prov, 'landPrice').tier, 'FALLBACK');
  assert.equal(field(prov, 'rentEvidence').tier, 'FALLBACK');
  assert.equal(field(prov, 'capRate').tier, 'FALLBACK');
  assert.equal(field(prov, 'occupancy').tier, 'FALLBACK');
  assert.equal(field(prov, 'financingRate').tier, 'FALLBACK');
  // zone came from a (mock) connector that returned a value → SEED.
  assert.equal(field(prov, 'zoning').tier, 'SEED');

  // 5 fallbacks + 1 mock = 6 estimated of 7 tracked (office has no deposit field).
  assert.equal(prov.totalCount, 7);
  assert.equal(prov.estimatedCount, 6);
  assert.equal(prov.confidence, 'low');
  assert.match(prov.trustHint, /6 of 7 key inputs are imputed\/fallback/);

  // Connector failure surfaced (not just console.warn).
  assert.equal(prov.connectorFailures.length, 1);
  assert.equal(prov.connectorFailures[0]!.label, 'rent-comps-primary');
});

test('multifamily poor bundle adds an IMPUTED deposit field', () => {
  const prov = buildAnalysisProvenance(
    {
      addressInput: '?',
      parcel: fixtureParcel(),
      location: { latitude: 37.5, longitude: 127.0 },
      districtName: '강남구',
      building: fixtureBuilding(),
      zone: fixtureZone(),
      landPricing: null,
      grid: fixtureGrid(),
      rentComps: [],
      macroMicro: macroNoEvidence(),
      assetClass: AssetClass.MULTIFAMILY
    },
    { mockGeocode: true }
  );
  const deposit = field(prov, 'deposit');
  assert.equal(deposit.tier, 'IMPUTED');
  assert.ok(ESTIMATED_TIERS.has(deposit.tier));
  assert.equal(prov.totalCount, 8);
});

// ---------------------------------------------------------------------------
// Rich bundle: live-ish connectors + comps → fewer fallbacks.
// ---------------------------------------------------------------------------

test('rich bundle with comps + live connectors flags far fewer estimates', () => {
  const prov = buildAnalysisProvenance(
    {
      addressInput: '서울특별시 강남구 테헤란로 100',
      parcel: fixtureParcel(),
      location: { latitude: 37.505, longitude: 127.054 },
      districtName: '강남구',
      building: fixtureBuilding(),
      zone: fixtureZone(),
      landPricing: {
        pnu: '1168010500101000001',
        officialLandPriceKrwPerSqm: 30_000_000,
        officialLandPriceYear: 2026,
        recentTransactionKrwPerSqm: 50_000_000,
        recentTransactionDate: '2025-09-15',
        vacancyPct: 5
      } satisfies LandPricing,
      grid: fixtureGrid(),
      rentComps: richComps(),
      macroMicro: macroWithEvidence(),
      assetClass: AssetClass.OFFICE
    },
    {
      mockGeocode: false,
      connectorModes: {
        useZone: 'live',
        landPricing: 'live',
        rentComps: 'live',
        macroMicro: 'live'
      }
    }
  );

  assert.equal(field(prov, 'geocode').tier, 'LIVE');
  assert.equal(field(prov, 'landPrice').tier, 'LIVE');
  assert.equal(field(prov, 'rentEvidence').tier, 'LIVE');
  assert.equal(field(prov, 'capRate').tier, 'LIVE');
  assert.equal(field(prov, 'occupancy').tier, 'LIVE');
  assert.equal(field(prov, 'zoning').tier, 'LIVE');
  // Construction cost is sourced from macro-micro; with macroMicro 'live' it is LIVE.
  assert.equal(field(prov, 'constructionCost').tier, 'LIVE');
  // Financing is still a hard fallback (no live debt-cost feed).
  assert.equal(field(prov, 'financingRate').tier, 'FALLBACK');

  // Only financing is estimated → 1 of 8 (construction-cost adds an 8th tracked
  // input, but it is LIVE so the estimated count is unchanged).
  assert.equal(prov.estimatedCount, 1);
  assert.equal(prov.totalCount, 8);
  assert.equal(prov.confidence, 'high');
  assert.match(prov.trustHint, /1 of 8 key inputs are imputed\/fallback/);
});

test('official-land-price-only path is IMPUTED (not a hard fallback)', () => {
  const prov = buildAnalysisProvenance(
    {
      addressInput: '?',
      parcel: fixtureParcel(),
      location: { latitude: 37.5, longitude: 127.0 },
      districtName: '강남구',
      building: fixtureBuilding(),
      zone: fixtureZone(),
      landPricing: {
        pnu: '1168010500101000001',
        officialLandPriceKrwPerSqm: 30_000_000,
        officialLandPriceYear: 2026,
        recentTransactionKrwPerSqm: null,
        recentTransactionDate: null,
        vacancyPct: 5
      } satisfies LandPricing,
      grid: fixtureGrid(),
      rentComps: richComps(),
      macroMicro: macroWithEvidence(),
      assetClass: AssetClass.OFFICE
    },
    { mockGeocode: false, connectorModes: { landPricing: 'live', rentComps: 'live' } }
  );
  assert.equal(field(prov, 'landPrice').tier, 'IMPUTED');
});
