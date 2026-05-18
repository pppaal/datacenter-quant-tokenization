/**
 * Top-level orchestrator: "click a building on the map" → full underwriting analysis.
 *
 * Flow:
 *   1. Geocode address → parcel + coords + district
 *   2. Hydrate public data (building registry, zone, land price, rent comps, grid, macro)
 *   3. Classify → primary AssetClass + alternatives
 *   4. Assemble UnderwritingBundle for the primary class
 *   5. Run buildValuationAnalysis → full underwriting (valuation + scenarios + memo)
 *   6. Optionally also re-run pipeline for 1-2 alternative classes for "highest-and-best-use" comparison
 */

import { AssetClass } from '@prisma/client';
import { geocodeAddress, reverseGeocode } from '@/lib/services/geocode/korea-geocode';
import { getConnectorBundle } from '@/lib/services/public-data/registry';
import {
  classifyAsset,
  type ClassificationResult
} from '@/lib/services/property-analyzer/asset-classifier';
import { assembleBundle } from '@/lib/services/property-analyzer/bundle-assembler';
import type {
  BuildingRegistryConnector,
  GridAccessConnector,
  LandPricingConnector,
  LatLng,
  MacroMicroConnector,
  RentComparableConnector,
  TransactionComp,
  TransactionCompsConnector,
  UseZoneConnector,
  RentalComparable
} from '@/lib/services/public-data/types';
import type { UnderwritingAnalysis, UnderwritingBundle } from '@/lib/services/valuation/types';
import { buildDataCenterValuationAnalysis } from '@/lib/services/valuation/strategies/data-center';
import { buildIndustrialValuationAnalysis } from '@/lib/services/valuation/strategies/industrial';
import { buildMultifamilyValuationAnalysis } from '@/lib/services/valuation/strategies/multifamily';
import { buildOfficeValuationAnalysis } from '@/lib/services/valuation/strategies/office';
import { buildRetailValuationAnalysis } from '@/lib/services/valuation/strategies/retail';
import {
  safeConnectorCall,
  type ConnectorOutcome
} from '@/lib/services/public-data/fetch-with-timeout';

export type AutoAnalyzeInput = {
  /** Either an address string (jibun or road) or a latlng pair. Provide one. */
  address?: string;
  location?: LatLng;
  /** Optionally force a specific asset class (overrides classifier). */
  overrideAssetClass?: AssetClass;
  /** Also re-run valuation for the top-N alternative asset classes. Default 0. */
  includeAlternatives?: number;
};

export type AutoAnalyzeResult = {
  resolvedAddress: {
    jibunAddress: string;
    roadAddress: string | null;
    pnu: string;
    latitude: number;
    longitude: number;
    districtName: string;
  };
  classification: ClassificationResult;
  bundle: UnderwritingBundle;
  primaryAnalysis: UnderwritingAnalysis;
  alternativeAnalyses: Array<{
    assetClass: AssetClass;
    analysis: UnderwritingAnalysis;
  }>;
  publicData: {
    building: unknown;
    zone: unknown;
    landPricing: unknown;
    grid: unknown;
    rentComps: RentalComparable[];
    transactionComps: TransactionComp[];
    macroMicro: unknown;
  };
};

export type AutoAnalyzeConnectors = {
  buildingRegistry?: BuildingRegistryConnector;
  useZone?: UseZoneConnector;
  landPricing?: LandPricingConnector;
  rentComps?: RentComparableConnector;
  grid?: GridAccessConnector;
  macroMicro?: MacroMicroConnector;
  transactionComps?: TransactionCompsConnector;
};

const STRATEGY_BY_CLASS: Partial<
  Record<AssetClass, (b: UnderwritingBundle) => Promise<UnderwritingAnalysis>>
> = {
  [AssetClass.OFFICE]: (b) => buildOfficeValuationAnalysis(b),
  [AssetClass.RETAIL]: (b) => buildRetailValuationAnalysis(b),
  [AssetClass.INDUSTRIAL]: (b) => buildIndustrialValuationAnalysis(b),
  [AssetClass.MULTIFAMILY]: (b) => buildMultifamilyValuationAnalysis(b),
  [AssetClass.DATA_CENTER]: (b) => buildDataCenterValuationAnalysis(b)
};

function runStrategy(cls: AssetClass, bundle: UnderwritingBundle): Promise<UnderwritingAnalysis> {
  const strategy = STRATEGY_BY_CLASS[cls];
  if (!strategy) {
    // Fall back to OFFICE for unsupported classes (HOTEL, LAND, MIXED_USE)
    return buildOfficeValuationAnalysis({
      ...bundle,
      asset: { ...bundle.asset, assetClass: AssetClass.OFFICE }
    });
  }
  return strategy(bundle);
}

export async function autoAnalyzeProperty(
  input: AutoAnalyzeInput,
  connectors: AutoAnalyzeConnectors = {}
): Promise<AutoAnalyzeResult> {
  // Resolve connectors from the central registry (live vs mock based on env),
  // then let any caller-supplied override win. This keeps the live-wiring rules
  // in a single place (see public-data/registry.ts).
  const defaults = getConnectorBundle();
  const buildingRegistry = connectors.buildingRegistry ?? defaults.buildingRegistry;
  const useZone = connectors.useZone ?? defaults.useZone;
  const landPricing = connectors.landPricing ?? defaults.landPricing;
  const rentComps = connectors.rentComps ?? defaults.rentComps;
  const grid = connectors.grid ?? defaults.grid;
  const macroMicro = connectors.macroMicro ?? defaults.macroMicro;
  const transactionCompsConnector = connectors.transactionComps ?? defaults.transactionComps;

  // 1. Resolve location
  let parcel;
  let location;
  let districtName;
  if (input.address) {
    const geo = geocodeAddress(input.address);
    if (!geo) {
      throw new Error(`Geocode failed for: ${input.address}`);
    }
    ({ parcel, location, districtName } = geo);
  } else if (input.location) {
    const rev = reverseGeocode(input.location);
    if (!rev) {
      throw new Error(`Reverse geocode failed for: ${JSON.stringify(input.location)}`);
    }
    parcel = rev.parcel;
    districtName = rev.districtName;
    location = input.location;
  } else {
    throw new Error('autoAnalyzeProperty requires either address or location');
  }

  // 2. Hydrate public data in parallel — each connector wrapped with a
  // timeout and a non-throwing outcome wrapper so a single flaky upstream
  // doesn't bomb the whole analysis. Zone is the only load-bearing field;
  // if it fails we still have to stop. Everything else has a safe fallback.
  const [buildingOutcome, zoneOutcome, pricingOutcome, gridOutcome, macroOutcome] =
    await Promise.all([
      safeConnectorCall('building-registry', () => buildingRegistry.fetch(parcel)),
      safeConnectorCall('use-zone', () => useZone.fetch(parcel)),
      safeConnectorCall('land-pricing', () => landPricing.fetch(parcel)),
      safeConnectorCall('grid-access', () => grid.fetch(parcel, location)),
      safeConnectorCall('macro-micro', () => macroMicro.fetch(districtName, ''))
    ]);

  const connectorFailures: Array<{ label: string; message: string }> = [];
  const pushFailure = <T>(outcome: ConnectorOutcome<T>) => {
    if (!outcome.ok)
      connectorFailures.push({ label: outcome.label, message: outcome.error.message });
  };
  pushFailure(buildingOutcome);
  pushFailure(zoneOutcome);
  pushFailure(pricingOutcome);
  pushFailure(gridOutcome);
  pushFailure(macroOutcome);
  if (connectorFailures.length > 0) {
    console.warn('[auto-analyze] connector failures', connectorFailures);
  }

  if (!zoneOutcome.ok || !zoneOutcome.value) {
    const reason = zoneOutcome.ok ? 'returned no record' : zoneOutcome.error.message;
    throw new Error(`Use-zone lookup failed for PNU ${parcel.pnu}: ${reason}`);
  }
  const zone = zoneOutcome.value;
  const building = buildingOutcome.ok ? buildingOutcome.value : null;
  const pricing = pricingOutcome.ok ? pricingOutcome.value : null;
  const gridAccess = gridOutcome.ok ? gridOutcome.value : null;
  if (!macroOutcome.ok) {
    throw new Error(`Macro snapshot required for analysis: ${macroOutcome.error.message}`);
  }
  const macro = macroOutcome.value;

  // 3. Classify
  const classification = classifyAsset(zone, building);
  const primaryClass = input.overrideAssetClass ?? classification.primary.assetClass;

  // 4. Fetch rent comps for primary class (and we'll fetch more on-demand for alts)
  const compClassMap: Record<AssetClass, RentalComparable['assetClassHint']> = {
    [AssetClass.OFFICE]: 'OFFICE',
    [AssetClass.RETAIL]: 'RETAIL',
    [AssetClass.INDUSTRIAL]: 'LOGISTICS',
    [AssetClass.MULTIFAMILY]: 'MULTIFAMILY',
    [AssetClass.DATA_CENTER]: 'DATA_CENTER',
    [AssetClass.HOTEL]: 'RETAIL',
    [AssetClass.LAND]: 'OFFICE',
    [AssetClass.MIXED_USE]: 'MIXED_USE'
  };
  const primaryCompsOutcome = await safeConnectorCall('rent-comps-primary', () =>
    rentComps.fetch(location, compClassMap[primaryClass], 2.0)
  );
  if (!primaryCompsOutcome.ok) {
    console.warn(
      '[auto-analyze] rent comps failed, using empty set',
      primaryCompsOutcome.error.message
    );
  }
  const primaryComps = primaryCompsOutcome.ok ? primaryCompsOutcome.value : [];

  // 4b. Transaction comps (RTMS) — first 5 digits of the 19-digit PNU = LAWD_CD (시군구 code).
  // Query a rolling 12-month window up to the current underwriting anchor.
  const lawdCode = parcel.pnu.slice(0, 5);
  const { fromYyyyMm, toYyyyMm } = rtmsWindowYyyyMm(new Date(), 12);
  const transactionCompsOutcome = await safeConnectorCall('transaction-comps', () =>
    transactionCompsConnector.fetch({ lawdCode, fromYyyyMm, toYyyyMm })
  );
  if (!transactionCompsOutcome.ok) {
    console.warn(
      '[auto-analyze] transaction comps failed, using empty set',
      transactionCompsOutcome.error.message
    );
  }
  const transactionCompsData = transactionCompsOutcome.ok ? transactionCompsOutcome.value : [];

  // 5. Assemble bundle for primary class
  const bundle = assembleBundle({
    addressInput: input.address ?? `${location.latitude},${location.longitude}`,
    parcel,
    location,
    districtName,
    building,
    zone,
    landPricing: pricing,
    grid: gridAccess,
    rentComps: primaryComps,
    transactionComps: transactionCompsData,
    macroMicro: macro,
    assetClass: primaryClass
  });

  // 6. Run primary valuation
  const primaryAnalysis = await runStrategy(primaryClass, bundle);

  // 7. Optionally run alternatives — in parallel so N alternatives takes
  // roughly as long as one (rent comps fetch + strategy are independent per class).
  const alternativeAnalyses: AutoAnalyzeResult['alternativeAnalyses'] = [];
  const altCount = input.includeAlternatives ?? 0;
  if (altCount > 0) {
    const alts = classification.alternatives
      .filter((a) => a.feasibility !== 'EXCLUDED')
      .filter((a) => a.assetClass !== primaryClass)
      .slice(0, altCount);
    const altResults = await Promise.allSettled(
      alts.map(async (alt) => {
        const altCompsOutcome = await safeConnectorCall(`rent-comps-alt-${alt.assetClass}`, () =>
          rentComps.fetch(location, compClassMap[alt.assetClass], 2.0)
        );
        const altComps = altCompsOutcome.ok ? altCompsOutcome.value : [];
        const altBundle = assembleBundle({
          addressInput: input.address ?? '',
          parcel,
          location,
          districtName,
          building,
          zone,
          landPricing: pricing,
          grid: gridAccess,
          rentComps: altComps,
          transactionComps: transactionCompsData,
          macroMicro: macro,
          assetClass: alt.assetClass
        });
        const altAnalysis = await runStrategy(alt.assetClass, altBundle);
        return { assetClass: alt.assetClass, analysis: altAnalysis };
      })
    );
    for (const res of altResults) {
      if (res.status === 'fulfilled') {
        alternativeAnalyses.push(res.value);
      } else {
        console.warn('[auto-analyze] alternative analysis failed', res.reason);
      }
    }
  }

  return {
    resolvedAddress: {
      jibunAddress: parcel.jibunAddress,
      roadAddress: parcel.roadAddress,
      pnu: parcel.pnu,
      latitude: location.latitude,
      longitude: location.longitude,
      districtName
    },
    classification,
    bundle,
    primaryAnalysis,
    alternativeAnalyses,
    publicData: {
      building,
      zone,
      landPricing: pricing,
      grid: gridAccess,
      rentComps: primaryComps,
      transactionComps: transactionCompsData,
      macroMicro: macro
    }
  };
}

/**
 * Produce (fromYyyyMm, toYyyyMm) for a trailing N-month RTMS window anchored
 * at `anchor`. Exposed for tests.
 */
export function rtmsWindowYyyyMm(
  anchor: Date,
  monthsBack: number
): {
  fromYyyyMm: string;
  toYyyyMm: string;
} {
  const toY = anchor.getUTCFullYear();
  const toM = anchor.getUTCMonth() + 1;
  const toYyyyMm = `${toY}${toM.toString().padStart(2, '0')}`;
  let fromY = toY;
  let fromM = toM - monthsBack + 1;
  while (fromM <= 0) {
    fromM += 12;
    fromY -= 1;
  }
  const fromYyyyMm = `${fromY}${fromM.toString().padStart(2, '0')}`;
  return { fromYyyyMm, toYyyyMm };
}
