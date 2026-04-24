/**
 * Mock 건축물대장 (MOLIT Building Registry) connector.
 * Returns realistic synthetic records keyed off PNU. Replace with real Open API later.
 */

import type {
  BuildingRecord,
  BuildingRegistryConnector,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickFromHash<T>(pnu: string, options: T[]): T {
  return options[hash(pnu) % options.length]!;
}

function jitter(pnu: string, min: number, max: number, salt = ''): number {
  const h = hash(pnu + salt);
  const frac = (h % 1000) / 1000;
  return min + frac * (max - min);
}

export class MockBuildingRegistry implements BuildingRegistryConnector {
  async fetch(parcel: ParcelIdentifier): Promise<BuildingRecord | null> {
    const { pnu, jibunAddress } = parcel;

    // Infer use class from address hints to make mocks feel realistic
    const addr = jibunAddress;
    let mainUse = '업무시설';
    let floors = 10;
    let gfa = 12_000;
    let coverage = 60;
    let far = 500;

    if (addr.includes('압구정') || addr.includes('청담') || addr.includes('신사')) {
      mainUse = pickFromHash(pnu, ['업무시설', '제2종근린생활시설', '판매시설']);
      floors = Math.round(jitter(pnu, 4, 12));
      gfa = Math.round(jitter(pnu, 3_000, 18_000));
      coverage = Math.round(jitter(pnu, 50, 70));
      far = Math.round(jitter(pnu, 300, 800));
    } else if (addr.includes('가산') || addr.includes('구로') || addr.includes('성수') || addr.includes('영등포')) {
      mainUse = pickFromHash(pnu, ['업무시설', '공장', '제1종근린생활시설']);
      floors = Math.round(jitter(pnu, 3, 9));
      gfa = Math.round(jitter(pnu, 5_000, 30_000));
      coverage = Math.round(jitter(pnu, 55, 70));
      far = Math.round(jitter(pnu, 400, 900));
    } else if (addr.includes('파주') || addr.includes('평택') || addr.includes('안성') || addr.includes('이천')) {
      mainUse = pickFromHash(pnu, ['창고시설', '공장', '업무시설']);
      floors = Math.round(jitter(pnu, 1, 4));
      gfa = Math.round(jitter(pnu, 10_000, 60_000));
      coverage = Math.round(jitter(pnu, 40, 60));
      far = Math.round(jitter(pnu, 100, 300));
    } else if (addr.includes('강서') || addr.includes('인천')) {
      mainUse = pickFromHash(pnu, ['공장', '업무시설', '창고시설']);
      floors = Math.round(jitter(pnu, 2, 6));
      gfa = Math.round(jitter(pnu, 8_000, 40_000));
      coverage = Math.round(jitter(pnu, 45, 65));
      far = Math.round(jitter(pnu, 200, 500));
    } else if (addr.includes('잠실') || addr.includes('여의도') || addr.includes('광화문') || addr.includes('역삼')) {
      mainUse = '업무시설';
      floors = Math.round(jitter(pnu, 15, 30));
      gfa = Math.round(jitter(pnu, 25_000, 100_000));
      coverage = Math.round(jitter(pnu, 55, 70));
      far = Math.round(jitter(pnu, 700, 1200));
    }

    const landArea = Math.round(jitter(pnu, 500, 3000, 'land'));
    const buildingArea = Math.round(landArea * coverage / 100);
    const approvalYear = 2000 + Math.round(jitter(pnu, 0, 24, 'yr'));

    return {
      pnu,
      buildingName: null,
      mainUse,
      structure: '철근콘크리트',
      floorsAboveGround: floors,
      floorsBelowGround: Math.round(jitter(pnu, 1, 4, 'b')),
      grossFloorAreaSqm: gfa,
      buildingAreaSqm: buildingArea,
      landAreaSqm: landArea,
      approvalYear,
      elevatorCount: Math.max(1, Math.round(floors / 6)),
      parkingCount: Math.round(gfa / 120),
      buildingCoveragePct: coverage,
      floorAreaRatioPct: far
    };
  }
}
