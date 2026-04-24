import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { classifyAsset } from '@/lib/services/property-analyzer/asset-classifier';
import type { BuildingRecord, UseZone } from '@/lib/services/public-data/types';

function makeZone(code: UseZone['zoningCode'], primary: string): UseZone {
  return {
    pnu: 'TEST',
    primaryZone: primary,
    specialDistrict: null,
    urbanPlanFacility: null,
    zoningCode: code
  };
}

function makeBuilding(mainUse: string): BuildingRecord {
  return {
    pnu: 'TEST',
    buildingName: null,
    mainUse,
    structure: 'RC',
    floorsAboveGround: 5,
    floorsBelowGround: 1,
    grossFloorAreaSqm: 5000,
    buildingAreaSqm: 600,
    landAreaSqm: 1000,
    approvalYear: 2015,
    elevatorCount: 2,
    parkingCount: 20,
    buildingCoveragePct: 60,
    floorAreaRatioPct: 500
  };
}

test('commercial-central zone primary = OFFICE and excludes DATA_CENTER', () => {
  const zone = makeZone('COMMERCIAL_CENTRAL', '중심상업지역');
  const building = makeBuilding('업무시설');
  const result = classifyAsset(zone, building);
  assert.equal(result.primary.assetClass, AssetClass.OFFICE);
  assert.equal(result.primary.feasibility, 'PRIMARY');
  const dc = result.alternatives.find((a) => a.assetClass === AssetClass.DATA_CENTER);
  assert.ok(dc, 'DC should appear as excluded alternative');
  assert.equal(dc.feasibility, 'EXCLUDED');
});

test('industrial-general zone allows both INDUSTRIAL and DATA_CENTER as VIABLE/PRIMARY', () => {
  const zone = makeZone('INDUSTRIAL_GENERAL', '일반공업지역');
  const building = makeBuilding('공장');
  const result = classifyAsset(zone, building);
  assert.equal(result.primary.assetClass, AssetClass.INDUSTRIAL);
  const dc = result.alternatives.find((a) => a.assetClass === AssetClass.DATA_CENTER);
  assert.ok(dc);
  assert.notEqual(dc.feasibility, 'EXCLUDED');
});

test('management-plan zone picks DATA_CENTER as primary when DC score outranks INDUSTRIAL', () => {
  const zone = makeZone('MANAGEMENT_PLAN', '계획관리지역');
  const result = classifyAsset(zone, null);
  assert.equal(result.primary.assetClass, AssetClass.DATA_CENTER);
});

test('residential zone picks MULTIFAMILY', () => {
  const zone = makeZone('RESIDENTIAL_3', '제3종일반주거지역');
  const building = makeBuilding('공동주택');
  const result = classifyAsset(zone, building);
  assert.equal(result.primary.assetClass, AssetClass.MULTIFAMILY);
});

test('main-use hint boosts matching candidate score', () => {
  const zone = makeZone('COMMERCIAL_GENERAL', '일반상업지역');
  const officeBuilding = makeBuilding('업무시설');
  const retailBuilding = makeBuilding('판매시설');
  const officeResult = classifyAsset(zone, officeBuilding);
  const retailResult = classifyAsset(zone, retailBuilding);
  assert.equal(officeResult.primary.assetClass, AssetClass.OFFICE);
  assert.equal(retailResult.primary.assetClass, AssetClass.RETAIL);
});

test('unknown zone falls back to OFFICE with VIABLE feasibility', () => {
  const zone = makeZone('UNKNOWN', '미지정');
  const result = classifyAsset(zone, null);
  assert.equal(result.primary.assetClass, AssetClass.OFFICE);
  assert.equal(result.primary.feasibility, 'VIABLE');
});
