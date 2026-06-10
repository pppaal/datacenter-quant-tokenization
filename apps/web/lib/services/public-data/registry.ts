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
 *   use-zone           → VWORLD_API_KEY        (V-World 토지이용계획)
 *   land-pricing       → VWORLD_API_KEY        (V-World 개별공시지가)
 *   rent-comps         → RONE_API_KEY          (한국부동산원 R-ONE 임대동향)
 *   macro-micro        → KOSIS_API_KEY         (통계청 KOSIS)
 *
 * All seven connectors now have a live adapter under `live/`; each returns
 * empty/null (or, for the non-nullable macro snapshot, delegates to the mock)
 * when its key is unset, so the mock path keeps working until a key is added.
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
import { LiveReoneRentComps } from './live/rone-rent';
import { LiveVworldLandPricing } from './live/vworld-land-price';
import { LiveVworldUseZone } from './live/vworld-use-zone';
import { LiveKosisMacroMicro } from './live/kosis-macro';

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
    useZone: process.env.VWORLD_API_KEY ? 'live' : 'mock',
    landPricing: process.env.VWORLD_API_KEY ? 'live' : 'mock',
    rentComps: process.env.RONE_API_KEY ? 'live' : 'mock',
    grid:
      process.env.KEPCO_SUBSTATION_DATA_PATH || process.env.KEPCO_SUBSTATION_DATA_URL
        ? 'live'
        : 'mock',
    macroMicro: process.env.KOSIS_API_KEY ? 'live' : 'mock',
    transactionComps: process.env.RTMS_SERVICE_KEY ? 'live' : 'mock'
  };
}

export function getConnectorBundle(): ConnectorBundle {
  const mode = resolveConnectorMode();
  return {
    buildingRegistry:
      mode.buildingRegistry === 'live'
        ? new LiveMolitBuildingRegistry()
        : new MockBuildingRegistry(),
    useZone: mode.useZone === 'live' ? new LiveVworldUseZone() : new MockUseZone(),
    landPricing: mode.landPricing === 'live' ? new LiveVworldLandPricing() : new MockLandPricing(),
    rentComps: mode.rentComps === 'live' ? new LiveReoneRentComps() : new MockRentComps(),
    grid: mode.grid === 'live' ? new LiveKepcoGridAccess() : new MockGridAccess(),
    macroMicro: mode.macroMicro === 'live' ? new LiveKosisMacroMicro() : new MockMacroMicro(),
    transactionComps:
      mode.transactionComps === 'live' ? new LiveRtmsTransactionComps() : new MockTransactionComps()
  };
}
