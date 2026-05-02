/**
 * Mock KEPCO grid access connector.
 * Realistic substation proximity + remaining capacity by metro region.
 * Real source: KEPCO 전력계통 open data + 변전소 대장.
 */

import type {
  GridAccess,
  GridAccessConnector,
  LatLng,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

type GridZone = {
  match: RegExp;
  substationName: string;
  distanceKm: number;
  availableMw: number | null;
  tariff: number;
  fiber: boolean;
  renewablePct: number | null;
};

// DC feasibility belt — where KEPCO has announced upcoming capacity
const GRID_ZONES: GridZone[] = [
  {
    match: /평택.*(고덕|포승)/,
    substationName: '고덕변전소',
    distanceKm: 1.8,
    availableMw: 80,
    tariff: 138,
    fiber: true,
    renewablePct: 15
  },
  {
    match: /파주/,
    substationName: '파주변전소',
    distanceKm: 3.2,
    availableMw: 40,
    tariff: 140,
    fiber: true,
    renewablePct: 10
  },
  {
    match: /안성/,
    substationName: '안성 345kV 변전소',
    distanceKm: 2.5,
    availableMw: 120,
    tariff: 135,
    fiber: true,
    renewablePct: 18
  },
  {
    match: /이천/,
    substationName: '이천변전소',
    distanceKm: 4.1,
    availableMw: 25,
    tariff: 142,
    fiber: true,
    renewablePct: 8
  },
  {
    match: /용인/,
    substationName: '용인변전소',
    distanceKm: 3.8,
    availableMw: 60,
    tariff: 141,
    fiber: true,
    renewablePct: 12
  },
  {
    match: /인천/,
    substationName: '인천변전소',
    distanceKm: 2.1,
    availableMw: 35,
    tariff: 143,
    fiber: true,
    renewablePct: 14
  },
  {
    match: /강서/,
    substationName: '강서변전소',
    distanceKm: 1.5,
    availableMw: 10,
    tariff: 148,
    fiber: true,
    renewablePct: 5
  },
  {
    match: /성수|가산|구로/,
    substationName: '영등포변전소',
    distanceKm: 2.8,
    availableMw: 5,
    tariff: 150,
    fiber: true,
    renewablePct: 3
  },
  {
    match: /서울/,
    substationName: '도심변전소',
    distanceKm: 3.5,
    availableMw: 2,
    tariff: 152,
    fiber: true,
    renewablePct: 2
  }
];

export class MockGridAccess implements GridAccessConnector {
  async fetch(parcel: ParcelIdentifier, _location: LatLng): Promise<GridAccess | null> {
    const addr = parcel.jibunAddress;
    const zone = GRID_ZONES.find((z) => z.match.test(addr)) ?? {
      substationName: '미상변전소',
      distanceKm: 8,
      availableMw: 0,
      tariff: 150,
      fiber: false,
      renewablePct: 0
    };
    return {
      pnu: parcel.pnu,
      nearestSubstationName: zone.substationName,
      nearestSubstationDistanceKm: zone.distanceKm,
      availableCapacityMw: zone.availableMw,
      tariffKrwPerKwh: zone.tariff,
      fiberBackboneAvailable: zone.fiber,
      renewableSourcingAvailablePct: zone.renewablePct
    };
  }
}
