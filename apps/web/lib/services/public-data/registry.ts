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
 *   macro-micro        → KOSIS_API_KEY → 'partial' (통계청 KOSIS; see note below)
 *
 * NOTE on macro-micro: KOSIS_API_KEY enables a genuinely-live construction-cost
 * figure inside the snapshot, but the submarket survey fields (vacancy /
 * rent-growth / cap-rate) still come from the mock baseline. We report the
 * connector as 'partial' when keyed: construction-cost is live, the submarket
 * survey is mock. The 'partial' tier exists precisely so we can be honest about
 * this split WITHOUT labeling any synthetic survey value 'live' — consumers map
 * 'partial' to a non-LIVE tier for the survey-derived fields (cap-rate /
 * occupancy) and surface the live construction-cost figure as its own provenance
 * row. It flips to a clean 'live' once the survey fields are genuinely sourced.
 * Unkeyed, the whole connector stays 'mock'.
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
/**
 * Provenance mode for a connector:
 *   - 'live'    — every surfaced field is genuinely sourced.
 *   - 'mock'    — every surfaced field is synthetic/seed.
 *   - 'partial' — some surfaced fields are live, others are still mock. Used by
 *     macro-micro (KOSIS): construction-cost is live, the submarket survey is
 *     mock. Consumers MUST NOT label a 'partial' connector's mock sub-fields as
 *     'live' — they map the survey fields to a non-LIVE tier and surface the
 *     live sub-field (construction-cost) separately.
 */
export type ConnectorMode = 'live' | 'mock' | 'partial';

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
    // macroMicro is 'partial' when keyed, never a blanket 'live'. The KOSIS
    // adapter sources construction-cost authoritatively; the submarket survey
    // fields (vacancy / rent-growth / cap-rate) ALWAYS come from the mock
    // baseline (see LiveKosisMacroMicro.fetch). 'partial' lets consumers be
    // honest about the split: the live construction-cost figure surfaces as its
    // own provenance row, while the survey-derived cap-rate / occupancy stay on
    // a non-LIVE tier so no synthetic value is ever labeled 'live'. Unkeyed it
    // is fully 'mock'. It graduates to a clean 'live' only when the survey
    // fields are genuinely sourced.
    macroMicro: process.env.KOSIS_API_KEY ? 'partial' : 'mock',
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
    // macroMicro mode is reported as 'partial' when keyed (construction-cost
    // live, survey sub-fields still synthetic — see resolveConnectorMode). The
    // live KOSIS adapter is wired whenever the key is present so the
    // genuinely-live construction-cost figure is fetched; it self-delegates to
    // the mock when unkeyed, so this is safe either way.
    macroMicro: process.env.KOSIS_API_KEY ? new LiveKosisMacroMicro() : new MockMacroMicro(),
    transactionComps:
      mode.transactionComps === 'live' ? new LiveRtmsTransactionComps() : new MockTransactionComps()
  };
}
