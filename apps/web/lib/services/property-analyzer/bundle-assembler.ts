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
import { classifyFreshness, type FreshnessBand } from '@/lib/services/im/freshness';

/**
 * Provenance tier for a single material input. Ordered roughly by trust:
 *   LIVE     — fetched from a live upstream connector (MOLIT / RTMS / KEPCO …)
 *   SEED     — deterministic mock connector standing in for a real source
 *   IMPUTED  — derived/estimated from other real inputs (e.g. occupancy from comps)
 *   FALLBACK — hard-coded constant used because no evidence was available
 *   MOCK     — synthetic geocode (no real address resolution happened)
 */
export type ProvenanceTier = 'LIVE' | 'SEED' | 'IMPUTED' | 'FALLBACK' | 'MOCK';

/** Tiers that mean "this number is not grounded in observed data". */
export const ESTIMATED_TIERS: ReadonlySet<ProvenanceTier> = new Set<ProvenanceTier>([
  'IMPUTED',
  'FALLBACK',
  'MOCK'
]);

export type ProvenanceField = {
  /** Stable machine key, e.g. "occupancy", "capRate". */
  field: string;
  /** Human label for the UI. */
  label: string;
  /** Resolved value as used by the engine (already formatted as a string). */
  value: string;
  tier: ProvenanceTier;
  /** Source-system label, e.g. "rent-comps (live)", "fallback-constant". */
  source: string;
  /** Optional asOf timestamp when known (drives freshness band). */
  asOf?: string | null;
  /** Optional freshness band derived from asOf. */
  freshness?: FreshnessBand | null;
  /** Short note explaining why this tier was assigned. */
  note: string;
};

export type ConnectorFailure = {
  label: string;
  message: string;
};

export type AnalysisProvenance = {
  fields: ProvenanceField[];
  connectorFailures: ConnectorFailure[];
  /** Number of material inputs that are estimated (IMPUTED/FALLBACK/MOCK). */
  estimatedCount: number;
  /** Total number of material inputs tracked. */
  totalCount: number;
  /** "N of M key inputs are estimated …" trust hint. */
  trustHint: string;
  /** Overall confidence band derived from the estimated ratio. */
  confidence: 'high' | 'medium' | 'low';
};

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
  return (
    input
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .slice(0, 40) || 'asset'
  );
}

function weightedAvg<T>(items: T[], value: (x: T) => number | null): number | null {
  const valid = items.map(value).filter((v): v is number => typeof v === 'number' && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function assetClassToCoreType(cls: AssetClass): string {
  switch (cls) {
    case AssetClass.OFFICE:
      return 'Office Building';
    case AssetClass.RETAIL:
      return 'Retail';
    case AssetClass.INDUSTRIAL:
      return 'Logistics / Industrial';
    case AssetClass.MULTIFAMILY:
      return 'Multifamily';
    case AssetClass.HOTEL:
      return 'Hotel';
    case AssetClass.DATA_CENTER:
      return 'Data Center';
    case AssetClass.LAND:
      return 'Land';
    case AssetClass.MIXED_USE:
      return 'Mixed Use';
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
  const landCost =
    landArea *
    (input.landPricing?.recentTransactionKrwPerSqm ??
      input.landPricing?.officialLandPriceKrwPerSqm ??
      2_000_000);
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
    [AssetClass.MULTIFAMILY]: 0.3,
    [AssetClass.HOTEL]: 0.55,
    [AssetClass.DATA_CENTER]: 0.45,
    [AssetClass.LAND]: 0.1,
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
    const itLoadKw = gfa * 0.4; // rough: 40% of GFA useable for IT racks
    return Math.round(avgKwRent * itLoadKw * 12 * occ);
  }
  if (avgSqmRent) {
    return Math.round(avgSqmRent * gfa * 12 * occ);
  }
  return Math.round(gfa * 60_000 * 12 * occ); // fallback
}

/** Per-connector live/mock mode, as resolved by the public-data registry. */
export type ConnectorModeMap = {
  buildingRegistry?: 'live' | 'mock';
  useZone?: 'live' | 'mock';
  landPricing?: 'live' | 'mock';
  rentComps?: 'live' | 'mock';
  grid?: 'live' | 'mock';
  macroMicro?: 'live' | 'mock';
};

export type ProvenanceContext = {
  /** True when the address could not be resolved by a real geocoder. */
  mockGeocode: boolean;
  /** Live/mock mode for each connector (defaults to 'mock' when omitted). */
  connectorModes?: ConnectorModeMap;
  /** Connector failures surfaced from auto-analyze (previously only console.warn'd). */
  connectorFailures?: ConnectorFailure[];
};

/**
 * Map a connector mode to the tier used when that connector DID return data.
 * A live connector that returned a value is LIVE; a mock one is SEED.
 */
function connectorTier(mode: 'live' | 'mock' | undefined): ProvenanceTier {
  return mode === 'live' ? 'LIVE' : 'SEED';
}

function withFreshness(field: Omit<ProvenanceField, 'freshness'>): ProvenanceField {
  const { band } = classifyFreshness(field.asOf ?? null);
  return { ...field, freshness: band };
}

/**
 * Inspect the assembled inputs and classify each material input by provenance
 * tier. This is surfacing-only: it never changes a single value the valuation
 * engine consumes; it only records WHERE each value came from.
 */
export function buildAnalysisProvenance(
  input: AssemblerInput,
  ctx: ProvenanceContext
): AnalysisProvenance {
  const modes = ctx.connectorModes ?? {};
  const fields: ProvenanceField[] = [];

  // --- address / geocode -------------------------------------------------
  fields.push(
    withFreshness(
      ctx.mockGeocode
        ? {
            field: 'geocode',
            label: 'Address / geocode',
            value: input.parcel.roadAddress ?? input.parcel.jibunAddress,
            tier: 'MOCK',
            source: 'mock-geocode',
            asOf: null,
            note: 'Coordinates synthesized; no live address resolution.'
          }
        : {
            field: 'geocode',
            label: 'Address / geocode',
            value: input.parcel.roadAddress ?? input.parcel.jibunAddress,
            tier: 'LIVE',
            source: 'korea-geocode',
            asOf: null,
            note: 'Resolved against geocoder.'
          }
    )
  );

  // --- zoning ------------------------------------------------------------
  fields.push(
    withFreshness({
      field: 'zoning',
      label: 'Use zone',
      value: input.zone.primaryZone,
      tier: connectorTier(modes.useZone),
      source: `use-zone (${modes.useZone ?? 'mock'})`,
      asOf: null,
      note:
        modes.useZone === 'live'
          ? 'Live zoning lookup.'
          : 'Seed zoning connector (no live VWorld adapter wired).'
    })
  );

  // --- land price --------------------------------------------------------
  const landTxn = input.landPricing?.recentTransactionKrwPerSqm ?? null;
  const landOfficial = input.landPricing?.officialLandPriceKrwPerSqm ?? null;
  if (landTxn != null) {
    fields.push(
      withFreshness({
        field: 'landPrice',
        label: 'Land price',
        value: `${Math.round(landTxn).toLocaleString()} KRW/㎡ (실거래)`,
        tier: connectorTier(modes.landPricing),
        source: `land-pricing (${modes.landPricing ?? 'mock'})`,
        asOf: input.landPricing?.recentTransactionDate ?? null,
        note: 'Recent transaction price used as basis.'
      })
    );
  } else if (landOfficial != null) {
    fields.push(
      withFreshness({
        field: 'landPrice',
        label: 'Land price',
        value: `${Math.round(landOfficial).toLocaleString()} KRW/㎡ (공시지가)`,
        tier: 'IMPUTED',
        source: `land-pricing (${modes.landPricing ?? 'mock'})`,
        asOf: input.landPricing ? `${input.landPricing.officialLandPriceYear}-01-01` : null,
        note: 'No 실거래; official 공시지가 used as a proxy for market value.'
      })
    );
  } else {
    fields.push(
      withFreshness({
        field: 'landPrice',
        label: 'Land price',
        value: '2,000,000 KRW/㎡',
        tier: 'FALLBACK',
        source: 'fallback-constant',
        asOf: null,
        note: 'No land-price evidence; default 2.0M KRW/㎡ applied.'
      })
    );
  }

  // --- rent / cap evidence ----------------------------------------------
  const haveRentComps = input.rentComps.length > 0;
  const compAsOf =
    input.rentComps
      .map((c) => c.transactionDate)
      .filter((d): d is string => typeof d === 'string')
      .sort()
      .at(-1) ?? null;
  if (haveRentComps) {
    fields.push(
      withFreshness({
        field: 'rentEvidence',
        label: 'Rent evidence',
        value: `${input.rentComps.length} comp(s)`,
        tier: connectorTier(modes.rentComps),
        source: `rent-comps (${modes.rentComps ?? 'mock'})`,
        asOf: compAsOf,
        note: 'Revenue derived from observed rent comparables.'
      })
    );
  } else {
    fields.push(
      withFreshness({
        field: 'rentEvidence',
        label: 'Rent / revenue',
        value: 'GFA × 60,000 KRW/㎡/mo',
        tier: 'FALLBACK',
        source: 'fallback-constant',
        asOf: null,
        note: 'No rent comps; revenue floored at GFA × 60,000 KRW/㎡/mo.'
      })
    );
  }

  // --- cap rate ----------------------------------------------------------
  const compCap = weightedAvg(input.rentComps, (c) => c.capRatePct);
  if (compCap != null) {
    fields.push(
      withFreshness({
        field: 'capRate',
        label: 'Cap rate',
        value: `${compCap.toFixed(2)}%`,
        tier: connectorTier(modes.rentComps),
        source: `rent-comps (${modes.rentComps ?? 'mock'})`,
        asOf: compAsOf,
        note: 'Cap rate from comparable transactions.'
      })
    );
  } else if (input.macroMicro.submarketCapRatePct != null) {
    fields.push(
      withFreshness({
        field: 'capRate',
        label: 'Cap rate',
        value: `${input.macroMicro.submarketCapRatePct.toFixed(2)}%`,
        tier: 'IMPUTED',
        source: `macro-micro (${modes.macroMicro ?? 'mock'})`,
        asOf: null,
        note: 'No comp cap rate; submarket cap rate used.'
      })
    );
  } else {
    fields.push(
      withFreshness({
        field: 'capRate',
        label: 'Cap rate',
        value: '6.00%',
        tier: 'FALLBACK',
        source: 'fallback-constant',
        asOf: null,
        note: 'No cap-rate evidence; default 6.0% applied.'
      })
    );
  }

  // --- occupancy ---------------------------------------------------------
  const compOcc = weightedAvg(input.rentComps, (c) => c.occupancyPct);
  if (compOcc != null) {
    fields.push(
      withFreshness({
        field: 'occupancy',
        label: 'Occupancy',
        value: `${Math.round(compOcc)}%`,
        tier: connectorTier(modes.rentComps),
        source: `rent-comps (${modes.rentComps ?? 'mock'})`,
        asOf: compAsOf,
        note: 'Occupancy from comparables.'
      })
    );
  } else if (input.macroMicro.submarketVacancyPct != null) {
    fields.push(
      withFreshness({
        field: 'occupancy',
        label: 'Occupancy',
        value: `${100 - input.macroMicro.submarketVacancyPct}%`,
        tier: 'IMPUTED',
        source: `macro-micro (${modes.macroMicro ?? 'mock'})`,
        asOf: null,
        note: 'Occupancy = 100% − submarket vacancy.'
      })
    );
  } else {
    fields.push(
      withFreshness({
        field: 'occupancy',
        label: 'Occupancy',
        value: '85%',
        tier: 'FALLBACK',
        source: 'fallback-constant',
        asOf: null,
        note: 'No occupancy evidence; default 85% applied (also used in revenue).'
      })
    );
  }

  // --- financing rate ----------------------------------------------------
  // The assembler hard-codes 5.4% with no live debt-cost connector today.
  fields.push(
    withFreshness({
      field: 'financingRate',
      label: 'Financing rate',
      value: '5.40%',
      tier: 'FALLBACK',
      source: 'fallback-constant',
      asOf: null,
      note: 'No live debt-cost feed; financing rate fixed at 5.4%.'
    })
  );

  // --- jeonse / deposit --------------------------------------------------
  // Multifamily underwriting assumes an imputed 전세 deposit when no lease
  // data is available. We surface it as IMPUTED for the relevant classes.
  if (input.assetClass === AssetClass.MULTIFAMILY) {
    fields.push(
      withFreshness({
        field: 'deposit',
        label: '전세 / deposit',
        value: 'imputed',
        tier: 'IMPUTED',
        source: 'assumption',
        asOf: null,
        note: 'No lease/deposit data; 전세 deposit imputed from rent.'
      })
    );
  }

  const estimatedCount = fields.filter((f) => ESTIMATED_TIERS.has(f.tier)).length;
  const totalCount = fields.length;
  const ratio = totalCount > 0 ? estimatedCount / totalCount : 0;
  const confidence: AnalysisProvenance['confidence'] =
    ratio >= 0.5 ? 'low' : ratio >= 0.25 ? 'medium' : 'high';
  const trustHint =
    estimatedCount === 0
      ? `All ${totalCount} key inputs are grounded in observed data.`
      : `${estimatedCount} of ${totalCount} key inputs are imputed/fallback — treat as screening only.`;

  return {
    fields,
    connectorFailures: ctx.connectorFailures ?? [],
    estimatedCount,
    totalCount,
    trustHint,
    confidence
  };
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
    weightedAvg(input.rentComps, (c) => c.occupancyPct) ??
    100 - (input.macroMicro.submarketVacancyPct ?? 10);

  const assetId = input.parcel.pnu.slice(-12);
  const slug = slugify(
    `${input.districtName}-${input.parcel.pnu.slice(-6)}-${input.assetClass.toLowerCase()}`
  );
  const assetCode = `${input.districtName
    .toUpperCase()
    .replace(/[가-힣]/g, (ch) => ch.charCodeAt(0).toString(36).toUpperCase().slice(-2))
    .slice(0, 4)}-${input.parcel.pnu.slice(-5)}`;
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
      targetItLoadMw:
        input.assetClass === AssetClass.DATA_CENTER && input.building?.grossFloorAreaSqm
          ? (input.building.grossFloorAreaSqm * 0.4) / 1000
          : null,
      powerCapacityMw: input.grid?.availableCapacityMw ?? null,
      landAreaSqm: input.building?.landAreaSqm ?? null,
      grossFloorAreaSqm: input.building?.grossFloorAreaSqm ?? null,
      rentableAreaSqm: input.building?.grossFloorAreaSqm
        ? Math.round(input.building.grossFloorAreaSqm * 0.82)
        : null,
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
    buildingSnapshot: input.building
      ? ({
          ...snapshotMeta,
          zoning: input.zone.primaryZone,
          buildingCoveragePct: input.building.buildingCoveragePct,
          floorAreaRatioPct: input.building.floorAreaRatioPct,
          grossFloorAreaSqm: input.building.grossFloorAreaSqm,
          structureDescription: input.building.structure,
          redundancyTier: input.assetClass === AssetClass.DATA_CENTER ? 'Tier III target' : null,
          coolingType:
            input.assetClass === AssetClass.DATA_CENTER ? 'Air-cooled CRAH (assumed)' : null
        } as unknown as UnderwritingBundle['buildingSnapshot'])
      : null,
    permitSnapshot: {
      ...snapshotMeta,
      permitStage: stage === 'STABILIZED' ? 'Operating' : 'Pending',
      zoningApprovalStatus: 'Zoned',
      environmentalReviewStatus: 'N/A',
      powerApprovalStatus:
        input.grid?.availableCapacityMw && input.grid.availableCapacityMw > 10
          ? 'Approved'
          : 'Pending',
      timelineNotes: '',
      reviewStatus: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      reviewNotes: null
    } as unknown as UnderwritingBundle['permitSnapshot'],
    energySnapshot: input.grid
      ? ({
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
        } as unknown as UnderwritingBundle['energySnapshot'])
      : null,
    marketSnapshot: {
      ...snapshotMeta,
      metroRegion: input.macroMicro.metroRegion,
      vacancyPct: input.macroMicro.submarketVacancyPct,
      colocationRatePerKwKrw:
        input.assetClass === AssetClass.DATA_CENTER
          ? (weightedAvg(input.rentComps, (c) => c.monthlyRentKrwPerKw) ?? null)
          : null,
      capRatePct: capRate,
      debtCostPct: 5.4,
      inflationPct: input.macroMicro.submarketInflationPct,
      constructionCostPerMwKrw: input.assetClass === AssetClass.DATA_CENTER ? 9_000_000_000 : null,
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
