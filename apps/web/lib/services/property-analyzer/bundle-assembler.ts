/**
 * Assembles an UnderwritingBundle from public-data connector outputs.
 * This is the bridge layer between "click a building" and the existing
 * valuation engine (buildValuationAnalysis).
 */

import { AssetClass, AssetStage, AssetStatus } from '@prisma/client';
import type {
  BuildingRecord,
  GridAccess,
  LandPricing,
  LatLng,
  MacroMicroSnapshot,
  ParcelIdentifier,
  RentalComparable,
  TransactionComp as PublicTransactionComp,
  UseZone
} from '@/lib/services/public-data/types';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

type AssemblerInput = {
  addressInput: string;
  parcel: ParcelIdentifier;
  location: LatLng;
  districtName: string;
  building: BuildingRecord | null;
  zone: UseZone;
  landPricing: LandPricing | null;
  grid: GridAccess | null;
  rentComps: RentalComparable[];
  transactionComps?: PublicTransactionComp[];
  macroMicro: MacroMicroSnapshot;
  assetClass: AssetClass;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 40) || 'asset';
}

function weightedAvg<T>(items: T[], value: (x: T) => number | null): number | null {
  const valid = items.map(value).filter((v): v is number => typeof v === 'number' && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function assetClassToCoreType(cls: AssetClass): string {
  switch (cls) {
    case AssetClass.OFFICE: return 'Office Building';
    case AssetClass.RETAIL: return 'Retail';
    case AssetClass.INDUSTRIAL: return 'Logistics / Industrial';
    case AssetClass.MULTIFAMILY: return 'Multifamily';
    case AssetClass.HOTEL: return 'Hotel';
    case AssetClass.DATA_CENTER: return 'Data Center';
    case AssetClass.LAND: return 'Land';
    case AssetClass.MIXED_USE: return 'Mixed Use';
  }
}

function inferStage(building: BuildingRecord | null, assetClass: AssetClass): AssetStage {
  if (!building) {
    return assetClass === AssetClass.DATA_CENTER ? AssetStage.POWER_REVIEW : AssetStage.SCREENING;
  }
  if (building.approvalYear && building.approvalYear <= 2023) return AssetStage.STABILIZED;
  if (building.approvalYear && building.approvalYear <= 2025) return AssetStage.LIVE;
  return AssetStage.CONSTRUCTION;
}

function estimatePurchasePrice(input: AssemblerInput): number | null {
  const landArea = input.building?.landAreaSqm ?? 1500;
  const landPricePerSqm =
    input.landPricing?.recentTransactionKrwPerSqm ??
    input.landPricing?.officialLandPriceKrwPerSqm ??
    null;
  if (!landPricePerSqm) return null;
  const landValue = landArea * landPricePerSqm;
  // Add building replacement cost proxy: GFA × per-sqm construction × depreciation
  const gfa = input.building?.grossFloorAreaSqm ?? landArea * 3;
  const replacement = gfa * (input.macroMicro.constructionCostPerSqmKrw ?? 3_800_000);
  const age = input.building?.approvalYear ? Math.max(0, 2026 - input.building.approvalYear) : 10;
  const depreciationFactor = Math.max(0.5, 1 - age * 0.015);
  return Math.round(landValue + replacement * depreciationFactor);
}

function estimateCapex(input: AssemblerInput): number {
  const landArea = input.building?.landAreaSqm ?? 2000;
  const gfa = input.building?.grossFloorAreaSqm ?? landArea * 3;
  const landCost = landArea * (input.landPricing?.recentTransactionKrwPerSqm ?? input.landPricing?.officialLandPriceKrwPerSqm ?? 2_000_000);
  const construction = gfa * (input.macroMicro.constructionCostPerSqmKrw ?? 3_800_000);
  // DC: power/mechanical premium
  if (input.assetClass === AssetClass.DATA_CENTER) {
    return Math.round(landCost + construction * 1.7);
  }
  return Math.round(landCost + construction * 1.1);
}

function estimateOpex(input: AssemblerInput, annualRevenue: number): number {
  // Opex as % of revenue — asset-class typical
  const ratio = {
    [AssetClass.OFFICE]: 0.25,
    [AssetClass.RETAIL]: 0.22,
    [AssetClass.INDUSTRIAL]: 0.18,
    [AssetClass.MULTIFAMILY]: 0.30,
    [AssetClass.HOTEL]: 0.55,
    [AssetClass.DATA_CENTER]: 0.45,
    [AssetClass.LAND]: 0.10,
    [AssetClass.MIXED_USE]: 0.28
  }[input.assetClass];
  return Math.round(annualRevenue * ratio);
}

function estimateAnnualRevenue(input: AssemblerInput): number {
  const gfa = input.building?.grossFloorAreaSqm ?? 10000;
  const occ = 0.85;

  const avgSqmRent = weightedAvg(input.rentComps, (c) => c.monthlyRentKrwPerSqm);
  const avgKwRent = weightedAvg(input.rentComps, (c) => c.monthlyRentKrwPerKw);

  if (input.assetClass === AssetClass.DATA_CENTER && avgKwRent) {
    const itLoadKw = gfa * 0.4;  // rough: 40% of GFA useable for IT racks
    return Math.round(avgKwRent * itLoadKw * 12 * occ);
  }
  if (avgSqmRent) {
    return Math.round(avgSqmRent * gfa * 12 * occ);
  }
  return Math.round(gfa * 60_000 * 12 * occ);  // fallback
}

export function assembleBundle(input: AssemblerInput): UnderwritingBundle {
  const annualRevenue = estimateAnnualRevenue(input);
  const opex = estimateOpex(input, annualRevenue);
  const capex = estimateCapex(input);
  const purchasePrice = estimatePurchasePrice(input);
  const stage = inferStage(input.building, input.assetClass);

  const capRate =
    weightedAvg(input.rentComps, (c) => c.capRatePct) ??
    input.macroMicro.submarketCapRatePct ??
    6.0;
  const avgOccupancy =
    weightedAvg(input.rentComps, (c) => c.occupancyPct) ?? (100 - (input.macroMicro.submarketVacancyPct ?? 10));

  const assetId = input.parcel.pnu.slice(-12);
  const slug = slugify(`${input.districtName}-${input.parcel.pnu.slice(-6)}-${input.assetClass.toLowerCase()}`);
  const assetCode = `${input.districtName.toUpperCase().replace(/[가-힣]/g, (ch) => ch.charCodeAt(0).toString(36).toUpperCase().slice(-2)).slice(0, 4)}-${input.parcel.pnu.slice(-5)}`;
  const now = new Date();
  const snapshotMeta = {
    id: `snap-${assetId}`,
    assetId,
    sourceStatus: 'MANUAL' as const,
    sourceUpdatedAt: now,
    createdAt: now,
    updatedAt: now
  };

  return {
    asset: {
      id: assetId,
      assetCode,
      slug,
      name: `${input.districtName} ${assetClassToCoreType(input.assetClass)}`,
      description: `Auto-analyzed ${assetClassToCoreType(input.assetClass)} at ${input.parcel.roadAddress ?? input.parcel.jibunAddress}. ${input.macroMicro.notes}`,
      assetClass: input.assetClass,
      assetType: assetClassToCoreType(input.assetClass),
      assetSubtype: null,
      market: 'KR',
      status: AssetStatus.INTAKE,
      stage,
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: input.assetClass === AssetClass.DATA_CENTER && input.building?.grossFloorAreaSqm
        ? (input.building.grossFloorAreaSqm * 0.4) / 1000 : null,
      powerCapacityMw: input.grid?.availableCapacityMw ?? null,
      landAreaSqm: input.building?.landAreaSqm ?? null,
      grossFloorAreaSqm: input.building?.grossFloorAreaSqm ?? null,
      rentableAreaSqm: input.building?.grossFloorAreaSqm
        ? Math.round(input.building.grossFloorAreaSqm * 0.82) : null,
      purchasePriceKrw: purchasePrice,
      occupancyAssumptionPct: Math.round(avgOccupancy),
      stabilizedOccupancyPct: Math.round(avgOccupancy),
      tenantAssumption: null,
      capexAssumptionKrw: capex,
      opexAssumptionKrw: opex,
      financingLtvPct: input.assetClass === AssetClass.DATA_CENTER ? 55 : 60,
      financingRatePct: 5.4,
      holdingPeriodYears: 10,
      exitCapRatePct: Number((capRate + 0.3).toFixed(2)),
      currentValuationKrw: purchasePrice,
      lastEnrichedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as UnderwritingBundle['asset'],
    address: {
      ...snapshotMeta,
      line1: input.parcel.roadAddress ?? input.parcel.jibunAddress,
      line2: null,
      city: input.districtName,
      district: input.districtName,
      province: input.parcel.jibunAddress.split(' ')[0] ?? '서울특별시',
      country: 'KR',
      postalCode: null,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      parcelId: input.parcel.pnu,
      sourceLabel: 'mock-geocode'
    } as unknown as UnderwritingBundle['address'],
    siteProfile: {
      ...snapshotMeta,
      gridAvailability: input.grid?.availableCapacityMw
        ? `${input.grid.availableCapacityMw}MW available at ${input.grid.nearestSubstationName} (${input.grid.nearestSubstationDistanceKm}km)`
        : 'Not power-reviewed',
      fiberAccess: input.grid?.fiberBackboneAvailable ? 'Backbone accessible' : 'Not confirmed',
      latencyProfile: 'Metro-tier',
      siteNotes: input.macroMicro.notes,
      floodRiskScore: null,
      wildfireRiskScore: null,
      seismicRiskScore: null
    } as unknown as UnderwritingBundle['siteProfile'],
    buildingSnapshot: input.building ? ({
      ...snapshotMeta,
      zoning: input.zone.primaryZone,
      buildingCoveragePct: input.building.buildingCoveragePct,
      floorAreaRatioPct: input.building.floorAreaRatioPct,
      grossFloorAreaSqm: input.building.grossFloorAreaSqm,
      structureDescription: input.building.structure,
      redundancyTier: input.assetClass === AssetClass.DATA_CENTER ? 'Tier III target' : null,
      coolingType: input.assetClass === AssetClass.DATA_CENTER ? 'Air-cooled CRAH (assumed)' : null
    } as unknown as UnderwritingBundle['buildingSnapshot']) : null,
    permitSnapshot: {
      ...snapshotMeta,
      permitStage: stage === 'STABILIZED' ? 'Operating' : 'Pending',
      zoningApprovalStatus: 'Zoned',
      environmentalReviewStatus: 'N/A',
      powerApprovalStatus: input.grid?.availableCapacityMw && input.grid.availableCapacityMw > 10 ? 'Approved' : 'Pending',
      timelineNotes: '',
      reviewStatus: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      reviewNotes: null
    } as unknown as UnderwritingBundle['permitSnapshot'],
    energySnapshot: input.grid ? ({
      ...snapshotMeta,
      utilityName: 'KEPCO',
      substationDistanceKm: input.grid.nearestSubstationDistanceKm,
      tariffKrwPerKwh: input.grid.tariffKrwPerKwh,
      renewableAvailabilityPct: input.grid.renewableSourcingAvailablePct,
      pueTarget: input.assetClass === AssetClass.DATA_CENTER ? 1.35 : null,
      backupFuelHours: input.assetClass === AssetClass.DATA_CENTER ? 48 : null,
      reviewStatus: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      reviewNotes: null
    } as unknown as UnderwritingBundle['energySnapshot']) : null,
    marketSnapshot: {
      ...snapshotMeta,
      metroRegion: input.macroMicro.metroRegion,
      vacancyPct: input.macroMicro.submarketVacancyPct,
      colocationRatePerKwKrw: input.assetClass === AssetClass.DATA_CENTER
        ? (weightedAvg(input.rentComps, (c) => c.monthlyRentKrwPerKw) ?? null) : null,
      capRatePct: capRate,
      debtCostPct: 5.4,
      inflationPct: input.macroMicro.submarketInflationPct,
      constructionCostPerMwKrw: input.assetClass === AssetClass.DATA_CENTER
        ? 9_000_000_000 : null,
      discountRatePct: capRate + 3.0,
      marketNotes: input.macroMicro.notes
    } as unknown as UnderwritingBundle['marketSnapshot'],
    buildingContext: {
      approvalYear: input.building?.approvalYear ?? null,
      regionalConstructionCostPerSqmKrw: input.macroMicro.constructionCostPerSqmKrw ?? null
    },
    transactionComps: (input.transactionComps ?? []).map((c, i) => ({
      id: `rtms-${i}`,
      assetId,
      market: 'KR',
      region: input.parcel.jibunAddress.split(' ')[0] ?? '서울특별시',
      comparableType: c.buildingUse ?? 'COMMERCIAL',
      transactionDate: c.transactionDate ? new Date(c.transactionDate) : null,
      priceKrw: c.dealAmountManWon * 10_000,
      pricePerSqmKrw: c.pricePerSqmKrw,
      pricePerMwKrw: null,
      capRatePct: null,
      buyerType: null,
      sellerType: null,
      sourceLink: null,
      sourceSystem: c.source,
      sourceStatus: 'MANUAL' as const,
      createdAt: now,
      updatedAt: now
    })) as unknown as UnderwritingBundle['transactionComps'],
    rentComps: input.rentComps.map((c, i) => ({
      id: `rc-${i}`,
      source: c.source,
      distanceKm: c.distanceKm,
      monthlyRentKrwPerSqm: c.monthlyRentKrwPerSqm,
      monthlyRentKrwPerKw: c.monthlyRentKrwPerKw,
      capRatePct: c.capRatePct,
      occupancyPct: c.occupancyPct,
      transactionDate: c.transactionDate,
      note: c.note
    })) as unknown as UnderwritingBundle['rentComps'],
    marketIndicatorSeries: [],
    macroSeries: [],
    officeDetail: null,
    comparableSet: { entries: [] } as unknown as UnderwritingBundle['comparableSet'],
    capexLineItems: [],
    leases: [],
    taxAssumption: null,
    spvStructure: null,
    debtFacilities: [],
    featureSnapshots: [],
    creditAssessments: []
  };
}
