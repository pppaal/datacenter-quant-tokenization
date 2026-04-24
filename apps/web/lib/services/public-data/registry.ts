/**
 * Central public-data connector registry. Resolves the right concrete
 * connector (live vs mock) for each kind based on environment variables.
 *
 * The contract is:
 *   - If the live adapter's required env var is present → live adapter
 *   - Otherwise → mock adapter
 *
 * Auto-analyze and other callers should depend on this registry instead of
 * importing concrete connectors directly. The flag table below documents the
 * current switch criteria — keep it updated when adding new live adapters.
 *
 *   building-registry  → MOLIT_BUILDING_API_KEY
 *   transaction-comps  → RTMS_SERVICE_KEY
 *   grid-access        → KEPCO_SUBSTATION_DATA_PATH || KEPCO_SUBSTATION_DATA_URL
 *
 * The remaining 3 connectors (use-zone, land-pricing, rent-comps,
 * macro-micro) currently only have mock implementations — adding a live
 * adapter is as simple as dropping a class under `live/` and adding a
 * branch here.
 */
import type {
  BuildingRegistryConnector,
  GridAccessConnector,
  LandPricingConnector,
  MacroMicroConnector,
  RentComparableConnector,
  TransactionCompsConnector,
  UseZoneConnector
} from './types';
import { MockBuildingRegistry } from './mock/building-registry';
import { MockGridAccess } from './mock/grid-access';
import { MockLandPricing } from './mock/land-price';
import { MockMacroMicro } from './mock/macro-micro';
import { MockRentComps } from './mock/rent-comps';
import { MockTransactionComps } from './mock/transaction-comps';
import { MockUseZone } from './mock/use-zone';
import { LiveMolitBuildingRegistry } from './live/molit-building';
import { LiveKepcoGridAccess } from './live/kepco-grid';
import { LiveRtmsTransactionComps } from './live/rtms';

export type ConnectorBundle = {
  buildingRegistry: BuildingRegistryConnector;
  useZone: UseZoneConnector;
  landPricing: LandPricingConnector;
  rentComps: RentComparableConnector;
  grid: GridAccessConnector;
  macroMicro: MacroMicroConnector;
  transactionComps: TransactionCompsConnector;
};

export type ConnectorKind = keyof ConnectorBundle;
export type ConnectorMode = 'live' | 'mock';

export type ConnectorModeReport = Record<ConnectorKind, ConnectorMode>;

export function resolveConnectorMode(): ConnectorModeReport {
  return {
    buildingRegistry: process.env.MOLIT_BUILDING_API_KEY ? 'live' : 'mock',
    useZone: 'mock',
    landPricing: 'mock',
    rentComps: 'mock',
    grid:
      process.env.KEPCO_SUBSTATION_DATA_PATH || process.env.KEPCO_SUBSTATION_DATA_URL
        ? 'live'
        : 'mock',
    macroMicro: 'mock',
    transactionComps: process.env.RTMS_SERVICE_KEY ? 'live' : 'mock'
  };
}

export function getConnectorBundle(): ConnectorBundle {
  const mode = resolveConnectorMode();
  return {
    buildingRegistry:
      mode.buildingRegistry === 'live' ? new LiveMolitBuildingRegistry() : new MockBuildingRegistry(),
    useZone: new MockUseZone(),
    landPricing: new MockLandPricing(),
    rentComps: new MockRentComps(),
    grid: mode.grid === 'live' ? new LiveKepcoGridAccess() : new MockGridAccess(),
    macroMicro: new MockMacroMicro(),
    transactionComps:
      mode.transactionComps === 'live'
        ? new LiveRtmsTransactionComps()
        : new MockTransactionComps()
  };
}
