/**
 * Build a transparent "what went into the confidence score" breakdown
 * from the asset bundle. The exact arithmetic of
 * buildDataCenterConfidenceScore lives in the engine — we don't
 * recompute the final number here. Instead we surface the same
 * inputs the engine used so the LP can see WHICH signals were
 * present and therefore why the score landed where it did.
 *
 * Each row describes a coverage flag the engine rewards (or the
 * absence of which it penalizes). Rendering follows: green dot =
 * signal present, slate dot = signal missing.
 */
type BundleLike = {
  siteProfile?: unknown;
  buildingSnapshot?: unknown;
  permitSnapshot?: unknown;
  energySnapshot?: unknown;
  marketSnapshot?: unknown;
  taxAssumption?: unknown;
  spvStructure?: unknown;
  comparableSet?: { entries?: unknown[] } | null;
  capexLineItems?: unknown[];
  leases?: unknown[];
  debtFacilities?: unknown[];
  transactionComps?: unknown[];
  rentComps?: unknown[];
  address?: { latitude?: number | null; longitude?: number | null } | null;
  purchasePriceKrw?: number | null;
  stabilizedOccupancyPct?: number | null;
  siteProfileFlood?: number | null;
};

export type ConfidenceSignal = {
  group: 'External sections' | 'Structured sections' | 'Geo & price anchors' | 'Risk penalties';
  label: string;
  present: boolean;
  /** Approximate point contribution; the actual engine clamps + applies a credit overlay. */
  weight: number;
  /** Negative for penalty signals. */
  direction: 'add' | 'subtract';
};

function presentObj(v: unknown): boolean {
  return !!v && typeof v === 'object';
}

function presentArr(v: unknown[] | undefined): number {
  return Array.isArray(v) ? v.length : 0;
}

export function buildConfidenceBreakdown(
  bundle: BundleLike,
  finalScore: number
): {
  finalScore: number;
  signals: ConfidenceSignal[];
  presentCount: number;
  totalCount: number;
} {
  const flood = ((bundle as { siteProfile?: { floodRiskScore?: number | null } }).siteProfile)
    ?.floodRiskScore ?? 0;
  const wildfire = ((bundle as { siteProfile?: { wildfireRiskScore?: number | null } }).siteProfile)
    ?.wildfireRiskScore ?? 0;

  const signals: ConfidenceSignal[] = [
    // External sections (×0.65 each in DC engine)
    { group: 'External sections', label: 'Site profile', present: presentObj(bundle.siteProfile), weight: 0.65, direction: 'add' },
    { group: 'External sections', label: 'Building snapshot', present: presentObj(bundle.buildingSnapshot), weight: 0.65, direction: 'add' },
    { group: 'External sections', label: 'Permit snapshot', present: presentObj(bundle.permitSnapshot), weight: 0.65, direction: 'add' },
    { group: 'External sections', label: 'Energy snapshot', present: presentObj(bundle.energySnapshot), weight: 0.65, direction: 'add' },
    { group: 'External sections', label: 'Market snapshot', present: presentObj(bundle.marketSnapshot), weight: 0.65, direction: 'add' },

    // Structured sections (×0.45 each)
    { group: 'Structured sections', label: 'Comparable set populated', present: presentArr(bundle.comparableSet?.entries) > 0, weight: 0.45, direction: 'add' },
    { group: 'Structured sections', label: 'Capex line items', present: presentArr(bundle.capexLineItems) > 0, weight: 0.45, direction: 'add' },
    { group: 'Structured sections', label: 'Leases on file', present: presentArr(bundle.leases) > 0, weight: 0.45, direction: 'add' },
    { group: 'Structured sections', label: 'Tax assumption', present: presentObj(bundle.taxAssumption), weight: 0.45, direction: 'add' },
    { group: 'Structured sections', label: 'SPV structure', present: presentObj(bundle.spvStructure), weight: 0.45, direction: 'add' },
    { group: 'Structured sections', label: 'Debt facilities', present: presentArr(bundle.debtFacilities) > 0, weight: 0.45, direction: 'add' },

    // Geo + price (small bonuses)
    { group: 'Geo & price anchors', label: 'Lat/long resolved', present: typeof bundle.address?.latitude === 'number', weight: 0.25, direction: 'add' },
    { group: 'Geo & price anchors', label: 'Purchase price set', present: typeof bundle.purchasePriceKrw === 'number' && (bundle.purchasePriceKrw ?? 0) > 0, weight: 0.2, direction: 'add' },
    { group: 'Geo & price anchors', label: 'Stabilized occupancy set', present: typeof bundle.stabilizedOccupancyPct === 'number' && (bundle.stabilizedOccupancyPct ?? 0) > 0, weight: 0.2, direction: 'add' },

    // Penalty signals — present means the penalty applies
    { group: 'Risk penalties', label: `Flood risk ×${flood.toFixed(1)}`, present: flood > 0, weight: Number((flood * 0.05).toFixed(2)), direction: 'subtract' },
    { group: 'Risk penalties', label: `Wildfire risk ×${wildfire.toFixed(1)}`, present: wildfire > 0, weight: Number((wildfire * 0.04).toFixed(2)), direction: 'subtract' }
  ];

  const presentCount = signals.filter((s) => s.present && s.direction === 'add').length;
  const totalCount = signals.filter((s) => s.direction === 'add').length;

  return {
    finalScore,
    signals,
    presentCount,
    totalCount
  };
}
