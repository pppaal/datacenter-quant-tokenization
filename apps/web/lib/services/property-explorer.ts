import { AssetClass, AssetStage, AssetStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createAsset, listAssets } from '@/lib/services/assets';
import type { AssetIntakeInput } from '@/lib/validations/asset';

type ExplorerSeed = {
  id: string;
  assetCode: string;
  name: string;
  assetClass: AssetClass;
  addressLine1: string;
  district: string;
  city: string;
  province: string;
  country: string;
  parcelId: string;
  latitude: number;
  longitude: number;
  ownerName: string;
  sponsorName: string;
  purchasePriceKrw: number;
  rentableAreaSqm?: number;
  grossFloorAreaSqm?: number;
  landAreaSqm?: number;
  powerCapacityMw?: number;
  targetItLoadMw?: number;
  stage: AssetStage;
  screenSummary: string;
  investmentAngle: string;
  diligenceAngle: string;
  officialSignals: Array<{ label: string; value: string }>;
  blockers: string[];
};

export type PropertyExplorerCandidate = {
  id: string;
  assetCode: string;
  name: string;
  assetClass: AssetClass;
  addressLine1: string;
  district: string;
  city: string;
  province: string;
  country: string;
  parcelId: string;
  latitude: number;
  longitude: number;
  mapPosition: {
    leftPct: number;
    topPct: number;
  };
  screenSummary: string;
  investmentAngle: string;
  diligenceAngle: string;
  officialSignals: Array<{ label: string; value: string }>;
  blockers: string[];
  linkedAssetId: string | null;
  linkedAssetName: string | null;
  hasLiveDossier: boolean;
};

export type PropertyExplorerData = {
  candidates: PropertyExplorerCandidate[];
  stats: {
    candidateCount: number;
    linkedAssetCount: number;
    untrackedCount: number;
    officeCount: number;
    dataCenterCount: number;
  };
};

const explorerSeeds: ExplorerSeed[] = [
  {
    id: 'explorer_yeouido_core_office',
    assetCode: 'SEOUL-YEOUIDO-01',
    name: 'Yeouido Core Office Tower',
    assetClass: AssetClass.OFFICE,
    addressLine1: '148 Yeoui-daero',
    district: 'Yeongdeungpo-gu',
    city: 'Seoul',
    province: 'Seoul',
    country: 'KR',
    parcelId: '11560-2030-0101',
    latitude: 37.5244,
    longitude: 126.9241,
    ownerName: 'Han River Office Holdings',
    sponsorName: 'Nexus Seoul Capital',
    purchasePriceKrw: 312_000_000_000,
    rentableAreaSqm: 28_500,
    grossFloorAreaSqm: 34_100,
    landAreaSqm: 4_200,
    stage: AssetStage.STABILIZED,
    screenSummary:
      'CBD office recap with approved underwriting evidence and live committee packaging history.',
    investmentAngle:
      'Core-plus office recap with visible rollover, lender engagement, and approved valuation support.',
    diligenceAngle:
      'Committee-ready legal and commercial lanes exist, but packet release still depends on current DD completeness.',
    officialSignals: [
      { label: 'Office vacancy', value: '6.2%' },
      { label: 'Recent cap rate', value: '4.8%' },
      { label: 'Official land price', value: 'high CBD band' }
    ],
    blockers: ['Refresh technical DD if facade reserve assumptions move.']
  },
  {
    id: 'explorer_gangseo_hyperscale',
    assetCode: 'SEOUL-GANGSEO-01',
    name: 'Seoul Hyperscale Campus I',
    assetClass: AssetClass.DATA_CENTER,
    addressLine1: '148 Gonghang-daero',
    district: 'Gangseo-gu',
    city: 'Seoul',
    province: 'Seoul',
    country: 'KR',
    parcelId: '11500-2034-0007',
    latitude: 37.5601,
    longitude: 126.8052,
    ownerName: 'Nexus Seoul Infra Sponsor',
    sponsorName: 'Nexus Seoul Capital',
    purchasePriceKrw: 418_000_000_000,
    landAreaSqm: 18_400,
    grossFloorAreaSqm: 52_000,
    powerCapacityMw: 22,
    targetItLoadMw: 18,
    stage: AssetStage.POWER_REVIEW,
    screenSummary:
      'West Seoul hyperscale parcel with power and registry-readiness shell already seeded in the operating model.',
    investmentAngle:
      'Infrastructure-style data-center underwriting with strong power thesis and readiness workflow support.',
    diligenceAngle:
      'Power, permit, and legal sequencing remain the main DD lanes before deeper IC packaging.',
    officialSignals: [
      { label: 'Power posture', value: '22 MW capacity screen' },
      { label: 'Fiber access', value: 'metro backbone corridor' },
      { label: 'Flood risk', value: 'low' }
    ],
    blockers: ['Secure final grid confirmation before moving to locked committee packet.']
  },
  {
    id: 'explorer_pangyo_office_park',
    assetCode: 'SEONGNAM-PANGYO-01',
    name: 'Pangyo Innovation Office Park',
    assetClass: AssetClass.OFFICE,
    addressLine1: '145 Pangyoyeok-ro',
    district: 'Bundang-gu',
    city: 'Seongnam',
    province: 'Gyeonggi-do',
    country: 'KR',
    parcelId: '41135-1100-0244',
    latitude: 37.3955,
    longitude: 127.1126,
    ownerName: 'Pangyo Innovation Holdings',
    sponsorName: 'Nexus Seoul Capital',
    purchasePriceKrw: 268_000_000_000,
    rentableAreaSqm: 23_800,
    grossFloorAreaSqm: 29_600,
    landAreaSqm: 5_100,
    stage: AssetStage.SCREENING,
    screenSummary:
      'Tech-corridor office candidate not yet opened as a full dossier but ready for first-pass institutional screening.',
    investmentAngle:
      'Pangyo office demand and tenant quality create a strong first-pass committee candidate if rent comps validate.',
    diligenceAngle:
      'Parcel, rent-roll, and title package should be bootstrapped into the DD stack immediately after intake.',
    officialSignals: [
      { label: 'Submarket rent trend', value: 'positive' },
      { label: 'Vacancy tone', value: 'tight innovation corridor' },
      { label: 'Transaction comps', value: '3 recent office trades' }
    ],
    blockers: ['No live dossier yet.', 'Title and lease abstract packages not linked.']
  },
  {
    id: 'explorer_incheon_edge_compute',
    assetCode: 'INCHEON-EDGE-01',
    name: 'Incheon Edge Compute Yard',
    assetClass: AssetClass.DATA_CENTER,
    addressLine1: '22 Songdo Future-ro',
    district: 'Yeonsu-gu',
    city: 'Incheon',
    province: 'Incheon',
    country: 'KR',
    parcelId: '28185-4400-0177',
    latitude: 37.3827,
    longitude: 126.6423,
    ownerName: 'Songdo Edge Infrastructure',
    sponsorName: 'Nexus Seoul Capital',
    purchasePriceKrw: 236_000_000_000,
    landAreaSqm: 11_600,
    grossFloorAreaSqm: 31_500,
    powerCapacityMw: 12,
    targetItLoadMw: 9,
    stage: AssetStage.SCREENING,
    screenSummary:
      'Smaller edge compute parcel with promising municipal support but incomplete diligence packages.',
    investmentAngle:
      'Edge compute and AI inference demand may support a smaller institutional screen if power certainty improves.',
    diligenceAngle:
      'Needs permit path, utility diligence, and market absorption work before a real investment view is credible.',
    officialSignals: [
      { label: 'Land-use planning', value: 'light industrial compatible' },
      { label: 'Power screen', value: '12 MW preliminary' },
      { label: 'Permit posture', value: 'pre-file only' }
    ],
    blockers: ['No approved evidence yet.', 'Permit and power lanes are still preliminary.']
  }
];

function clampPercent(value: number) {
  return Math.min(92, Math.max(8, value));
}

function buildMapPositions(seeds: ExplorerSeed[]) {
  const longitudes = seeds.map((seed) => seed.longitude);
  const latitudes = seeds.map((seed) => seed.latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.01);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.01);

  return new Map(
    seeds.map((seed) => [
      seed.id,
      {
        leftPct: clampPercent(((seed.longitude - minLongitude) / longitudeSpan) * 100),
        topPct: clampPercent(100 - ((seed.latitude - minLatitude) / latitudeSpan) * 100)
      }
    ])
  );
}

function buildBootstrapInput(seed: ExplorerSeed): AssetIntakeInput {
  return {
    assetClass: seed.assetClass,
    assetCode: seed.assetCode,
    name: seed.name,
    assetType:
      seed.assetClass === AssetClass.DATA_CENTER
        ? 'Data Center'
        : seed.assetClass === AssetClass.OFFICE
          ? 'Office'
          : 'Real Estate',
    status: AssetStatus.INTAKE,
    stage: seed.stage,
    description: `${seed.screenSummary} ${seed.investmentAngle}`,
    ownerName: seed.ownerName,
    sponsorName: seed.sponsorName,
    developmentSummary: seed.diligenceAngle,
    targetItLoadMw: seed.targetItLoadMw,
    powerCapacityMw: seed.powerCapacityMw,
    landAreaSqm: seed.landAreaSqm,
    grossFloorAreaSqm: seed.grossFloorAreaSqm,
    rentableAreaSqm: seed.rentableAreaSqm,
    purchasePriceKrw: seed.purchasePriceKrw,
    occupancyAssumptionPct: seed.assetClass === AssetClass.OFFICE ? 92 : undefined,
    stabilizedOccupancyPct: seed.assetClass === AssetClass.OFFICE ? 94 : undefined,
    capexAssumptionKrw: seed.assetClass === AssetClass.DATA_CENTER ? 22_000_000_000 : 7_500_000_000,
    opexAssumptionKrw: seed.assetClass === AssetClass.DATA_CENTER ? 18_000_000_000 : 11_000_000_000,
    financingLtvPct: seed.assetClass === AssetClass.DATA_CENTER ? 50 : 52,
    financingRatePct: seed.assetClass === AssetClass.DATA_CENTER ? 5.2 : 4.9,
    holdingPeriodYears: 5,
    exitCapRatePct: seed.assetClass === AssetClass.DATA_CENTER ? 5.8 : 4.9,
    line1: seed.addressLine1,
    district: seed.district,
    city: seed.city,
    province: seed.province,
    country: seed.country,
    parcelId: seed.parcelId,
    latitude: seed.latitude,
    longitude: seed.longitude,
    siteNotes: `Bootstrapped from universal property explorer. ${seed.blockers.join(' ')}`
  };
}

export async function buildPropertyExplorerData(
  db: PrismaClient = prisma
): Promise<PropertyExplorerData> {
  const assets = await listAssets(db);
  const mapPositions = buildMapPositions(explorerSeeds);

  const candidates = explorerSeeds.map<PropertyExplorerCandidate>((seed) => {
    const linkedAsset =
      assets.find((asset) => asset.assetCode === seed.assetCode) ??
      assets.find((asset) => asset.address?.parcelId && asset.address.parcelId === seed.parcelId) ??
      null;

    return {
      id: seed.id,
      assetCode: seed.assetCode,
      name: seed.name,
      assetClass: seed.assetClass,
      addressLine1: seed.addressLine1,
      district: seed.district,
      city: seed.city,
      province: seed.province,
      country: seed.country,
      parcelId: seed.parcelId,
      latitude: seed.latitude,
      longitude: seed.longitude,
      mapPosition: mapPositions.get(seed.id) ?? { leftPct: 50, topPct: 50 },
      screenSummary: seed.screenSummary,
      investmentAngle: seed.investmentAngle,
      diligenceAngle: seed.diligenceAngle,
      officialSignals: seed.officialSignals,
      blockers: seed.blockers,
      linkedAssetId: linkedAsset?.id ?? null,
      linkedAssetName: linkedAsset?.name ?? null,
      hasLiveDossier: Boolean(linkedAsset)
    };
  });

  return {
    candidates,
    stats: {
      candidateCount: candidates.length,
      linkedAssetCount: candidates.filter((candidate) => candidate.hasLiveDossier).length,
      untrackedCount: candidates.filter((candidate) => !candidate.hasLiveDossier).length,
      officeCount: candidates.filter((candidate) => candidate.assetClass === AssetClass.OFFICE)
        .length,
      dataCenterCount: candidates.filter(
        (candidate) => candidate.assetClass === AssetClass.DATA_CENTER
      ).length
    }
  };
}

export function getPropertyExplorerSeed(candidateId: string) {
  return explorerSeeds.find((seed) => seed.id === candidateId) ?? null;
}

export async function bootstrapPropertyCandidate(candidateId: string, db: PrismaClient = prisma) {
  const seed = getPropertyExplorerSeed(candidateId);
  if (!seed) {
    throw new Error('Property candidate not found');
  }

  const existingAsset = await db.asset.findFirst({
    where: {
      OR: [{ assetCode: seed.assetCode }, { address: { is: { parcelId: seed.parcelId } } }]
    },
    include: {
      address: true,
      siteProfile: true,
      marketSnapshot: true,
      valuations: {
        take: 1,
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  if (existingAsset) {
    return existingAsset;
  }

  return createAsset(buildBootstrapInput(seed), db);
}
