/**
 * Competitive-intelligence engine — takes the full universe of competing
 * assets in a submarket (transactions, rent comps, pipeline deliveries,
 * tenant moves) and produces a single structured view of how the subject
 * asset is positioned vs the competitive set.
 *
 * Why this exists:
 *   CBRE / JLL charge money for exactly this. An originator doesn't just
 *   want "Seoul Q2 office cap rate is 5.4%" — they want to know where the
 *   subject's 6.2% cap sits in the distribution, whether the last 5
 *   transactions were inside or outside the subject's current bid, how
 *   much new supply lands in the next 24 months, and which tenants just
 *   moved out of competing buildings (signaling either availability or
 *   distress).
 *
 *   This module is a pure function — it takes typed inputs and returns a
 *   typed report. It does not fetch data. The workspace layer is
 *   responsible for assembling the inputs from Prisma. Designed to be
 *   swappable: a better data layer behind it = a better output, same API.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type CompTransaction = {
  id: string;
  dealDate: Date;
  priceKrw: number;
  gfaSqm: number;
  capRatePct: number | null;
  pricePerSqmKrw: number;
  buyerName: string | null;
  sellerName: string | null;
  assetLabel: string;
};

export type CompRent = {
  id: string;
  observationDate: Date;
  monthlyRentKrwPerSqm: number;
  occupancyPct: number | null;
  assetLabel: string;
};

export type PipelineDelivery = {
  id: string;
  projectName: string;
  expectedDeliveryDate: Date;
  expectedGfaSqm: number;
  developer: string | null;
  stage: 'PLANNED' | 'UNDER_CONSTRUCTION' | 'LEASE_UP' | 'DELIVERED';
};

export type TenantMove = {
  id: string;
  observationDate: Date;
  tenantName: string;
  moveType: 'MOVED_IN' | 'MOVED_OUT' | 'RENEWAL' | 'DOWNSIZE' | 'EXPANSION';
  areaSqm: number | null;
  fromAssetLabel: string | null;
  toAssetLabel: string | null;
};

export type SubjectPosition = {
  assetLabel: string;
  currentCapRatePct: number | null;
  currentMonthlyRentKrwPerSqm: number | null;
  currentOccupancyPct: number | null;
  gfaSqm: number;
};

export type CompetitiveIntelInput = {
  submarketLabel: string;
  asOf: Date;
  subject: SubjectPosition;
  transactions: CompTransaction[];
  rents: CompRent[];
  pipeline: PipelineDelivery[];
  tenantMoves: TenantMove[];
  /** Total existing submarket inventory (sqm). Used for absorption math. */
  submarketExistingInventorySqm: number | null;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type Percentile = {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
};

export type TransactionVelocity = {
  last90dCount: number;
  last180dCount: number;
  last365dCount: number;
  trailing12mTotalKrw: number;
  momentum: 'ACCELERATING' | 'STEADY' | 'SLOWING' | 'FROZEN';
};

export type SupplyOutlook = {
  next12mDeliverySqm: number;
  next24mDeliverySqm: number;
  pipelineAsPctOfInventory: number | null;
  supplyShockRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  largestIncomingProject: PipelineDelivery | null;
};

export type TenantSignals = {
  last180dMoveInCount: number;
  last180dMoveOutCount: number;
  last180dNetAbsorptionSqm: number;
  notableMoves: TenantMove[];
  signal: 'INFLOW' | 'BALANCED' | 'OUTFLOW';
};

export type SubjectPositioning = {
  capRateVsMedianBps: number | null;
  capRatePercentile: number | null;
  rentVsMedianPct: number | null;
  rentPercentile: number | null;
  occupancyVsMedianPct: number | null;
  positioningVerdict:
    | 'PREMIUM'
    | 'IN_LINE'
    | 'DISCOUNT'
    | 'DISTRESSED'
    | 'INSUFFICIENT_COMPS';
  rationale: string;
};

export type CompetitiveIntelReport = {
  submarketLabel: string;
  asOf: Date;
  compCounts: {
    transactions: number;
    rents: number;
    pipeline: number;
    tenantMoves: number;
  };
  capRateDistribution: Percentile | null;
  rentDistribution: Percentile | null;
  occupancyDistribution: Percentile | null;
  pricePerSqmDistribution: Percentile | null;
  transactionVelocity: TransactionVelocity;
  supplyOutlook: SupplyOutlook;
  tenantSignals: TenantSignals;
  subjectPositioning: SubjectPositioning;
  headline: string;
  watchList: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function distribution(values: number[]): Percentile | null {
  if (values.length === 0) return null;
  return {
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    median: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90)
  };
}

function valuePercentile(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 50;
  const below = sorted.filter((v) => v <= value).length;
  return Math.round((below / sorted.length) * 100);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Analyzers
// ---------------------------------------------------------------------------

function analyzeTransactionVelocity(
  txns: CompTransaction[],
  asOf: Date
): TransactionVelocity {
  const last90 = txns.filter((t) => daysBetween(t.dealDate, asOf) <= 90).length;
  const last180 = txns.filter((t) => daysBetween(t.dealDate, asOf) <= 180).length;
  const last365 = txns.filter((t) => daysBetween(t.dealDate, asOf) <= 365).length;
  const trailing12mTotal = txns
    .filter((t) => daysBetween(t.dealDate, asOf) <= 365)
    .reduce((sum, t) => sum + t.priceKrw, 0);
  const prior180To365 = last365 - last180;
  let momentum: TransactionVelocity['momentum'];
  if (last180 === 0 && prior180To365 === 0) momentum = 'FROZEN';
  else if (last180 === 0) momentum = 'SLOWING';
  else if (prior180To365 === 0) momentum = 'ACCELERATING';
  else if (last180 > prior180To365 * 1.3) momentum = 'ACCELERATING';
  else if (last180 < prior180To365 * 0.7) momentum = 'SLOWING';
  else momentum = 'STEADY';
  return {
    last90dCount: last90,
    last180dCount: last180,
    last365dCount: last365,
    trailing12mTotalKrw: trailing12mTotal,
    momentum
  };
}

function analyzeSupply(
  pipeline: PipelineDelivery[],
  asOf: Date,
  inventorySqm: number | null
): SupplyOutlook {
  const twelveMoAhead = new Date(asOf.getTime() + 365 * 24 * 60 * 60 * 1000);
  const twentyFourMoAhead = new Date(asOf.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const next12mList = pipeline.filter(
    (p) => p.expectedDeliveryDate >= asOf && p.expectedDeliveryDate <= twelveMoAhead
  );
  const next24mList = pipeline.filter(
    (p) => p.expectedDeliveryDate >= asOf && p.expectedDeliveryDate <= twentyFourMoAhead
  );
  const next12m = next12mList.reduce((sum, p) => sum + p.expectedGfaSqm, 0);
  const next24m = next24mList.reduce((sum, p) => sum + p.expectedGfaSqm, 0);
  const pctOfInventory =
    inventorySqm && inventorySqm > 0 ? (next24m / inventorySqm) * 100 : null;
  let risk: SupplyOutlook['supplyShockRisk'];
  if (pctOfInventory === null) risk = 'MODERATE';
  else if (pctOfInventory >= 15) risk = 'EXTREME';
  else if (pctOfInventory >= 8) risk = 'HIGH';
  else if (pctOfInventory >= 3) risk = 'MODERATE';
  else risk = 'LOW';
  const largest =
    next24mList.length > 0
      ? [...next24mList].sort((a, b) => b.expectedGfaSqm - a.expectedGfaSqm)[0]!
      : null;
  return {
    next12mDeliverySqm: next12m,
    next24mDeliverySqm: next24m,
    pipelineAsPctOfInventory: pctOfInventory,
    supplyShockRisk: risk,
    largestIncomingProject: largest
  };
}

function analyzeTenantSignals(moves: TenantMove[], asOf: Date): TenantSignals {
  const recent = moves.filter((m) => daysBetween(m.observationDate, asOf) <= 180);
  const moveIn = recent.filter((m) => m.moveType === 'MOVED_IN' || m.moveType === 'EXPANSION').length;
  const moveOut = recent.filter((m) => m.moveType === 'MOVED_OUT' || m.moveType === 'DOWNSIZE').length;
  const netAbsorption = recent.reduce((sum, m) => {
    const area = m.areaSqm ?? 0;
    if (m.moveType === 'MOVED_IN' || m.moveType === 'EXPANSION') return sum + area;
    if (m.moveType === 'MOVED_OUT' || m.moveType === 'DOWNSIZE') return sum - area;
    return sum;
  }, 0);
  let signal: TenantSignals['signal'];
  if (moveIn > moveOut * 1.5) signal = 'INFLOW';
  else if (moveOut > moveIn * 1.5) signal = 'OUTFLOW';
  else signal = 'BALANCED';
  const notable = [...recent]
    .filter((m) => (m.areaSqm ?? 0) >= 1000)
    .sort((a, b) => (b.areaSqm ?? 0) - (a.areaSqm ?? 0))
    .slice(0, 5);
  return {
    last180dMoveInCount: moveIn,
    last180dMoveOutCount: moveOut,
    last180dNetAbsorptionSqm: netAbsorption,
    notableMoves: notable,
    signal
  };
}

function analyzeSubjectPositioning(
  subject: SubjectPosition,
  capDist: Percentile | null,
  rentDist: Percentile | null,
  occDist: Percentile | null,
  capValues: number[],
  rentValues: number[],
  compCount: number
): SubjectPositioning {
  if (compCount < 3) {
    return {
      capRateVsMedianBps: null,
      capRatePercentile: null,
      rentVsMedianPct: null,
      rentPercentile: null,
      occupancyVsMedianPct: null,
      positioningVerdict: 'INSUFFICIENT_COMPS',
      rationale: `Only ${compCount} comparable data points — positioning cannot be inferred reliably`
    };
  }
  const capBps =
    subject.currentCapRatePct !== null && capDist !== null
      ? Math.round((subject.currentCapRatePct - capDist.median) * 100)
      : null;
  const capPct =
    subject.currentCapRatePct !== null && capValues.length > 0
      ? valuePercentile(subject.currentCapRatePct, [...capValues].sort((a, b) => a - b))
      : null;
  const rentPct =
    subject.currentMonthlyRentKrwPerSqm !== null && rentValues.length > 0
      ? valuePercentile(
          subject.currentMonthlyRentKrwPerSqm,
          [...rentValues].sort((a, b) => a - b)
        )
      : null;
  const rentVsMedianPct =
    subject.currentMonthlyRentKrwPerSqm !== null && rentDist !== null && rentDist.median > 0
      ? ((subject.currentMonthlyRentKrwPerSqm - rentDist.median) / rentDist.median) * 100
      : null;
  const occVsMedianPct =
    subject.currentOccupancyPct !== null && occDist !== null
      ? subject.currentOccupancyPct - occDist.median
      : null;

  let verdict: SubjectPositioning['positioningVerdict'];
  if (capBps === null) verdict = 'IN_LINE';
  else if (capBps <= -50) verdict = 'PREMIUM';
  else if (capBps >= 100) verdict = 'DISTRESSED';
  else if (capBps >= 30) verdict = 'DISCOUNT';
  else verdict = 'IN_LINE';

  const parts: string[] = [];
  if (capBps !== null) {
    parts.push(
      capBps >= 0
        ? `Cap rate ${capBps}bps wide of submarket median`
        : `Cap rate ${Math.abs(capBps)}bps tight to submarket median`
    );
  }
  if (rentVsMedianPct !== null) {
    parts.push(
      rentVsMedianPct >= 0
        ? `rent ${rentVsMedianPct.toFixed(1)}% above median`
        : `rent ${Math.abs(rentVsMedianPct).toFixed(1)}% below median`
    );
  }
  if (occVsMedianPct !== null) {
    parts.push(
      occVsMedianPct >= 0
        ? `occupancy +${occVsMedianPct.toFixed(1)}pp vs median`
        : `occupancy ${occVsMedianPct.toFixed(1)}pp vs median`
    );
  }

  return {
    capRateVsMedianBps: capBps,
    capRatePercentile: capPct,
    rentVsMedianPct,
    rentPercentile: rentPct,
    occupancyVsMedianPct: occVsMedianPct,
    positioningVerdict: verdict,
    rationale: parts.join('; ') || 'Subject metrics unavailable'
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildCompetitiveIntelligence(
  input: CompetitiveIntelInput
): CompetitiveIntelReport {
  const capValues = input.transactions
    .map((t) => t.capRatePct)
    .filter((v): v is number => v !== null);
  const rentValues = input.rents.map((r) => r.monthlyRentKrwPerSqm);
  const occupancyValues = input.rents
    .map((r) => r.occupancyPct)
    .filter((v): v is number => v !== null);
  const pricePerSqmValues = input.transactions.map((t) => t.pricePerSqmKrw);

  const capRateDistribution = distribution(capValues);
  const rentDistribution = distribution(rentValues);
  const occupancyDistribution = distribution(occupancyValues);
  const pricePerSqmDistribution = distribution(pricePerSqmValues);

  const velocity = analyzeTransactionVelocity(input.transactions, input.asOf);
  const supply = analyzeSupply(input.pipeline, input.asOf, input.submarketExistingInventorySqm);
  const tenants = analyzeTenantSignals(input.tenantMoves, input.asOf);
  const positioning = analyzeSubjectPositioning(
    input.subject,
    capRateDistribution,
    rentDistribution,
    occupancyDistribution,
    capValues,
    rentValues,
    input.transactions.length
  );

  const watchList = buildWatchList(velocity, supply, tenants, positioning);
  const headline = buildHeadline(input.submarketLabel, velocity, supply, tenants, positioning);

  return {
    submarketLabel: input.submarketLabel,
    asOf: input.asOf,
    compCounts: {
      transactions: input.transactions.length,
      rents: input.rents.length,
      pipeline: input.pipeline.length,
      tenantMoves: input.tenantMoves.length
    },
    capRateDistribution,
    rentDistribution,
    occupancyDistribution,
    pricePerSqmDistribution,
    transactionVelocity: velocity,
    supplyOutlook: supply,
    tenantSignals: tenants,
    subjectPositioning: positioning,
    headline,
    watchList
  };
}

function buildWatchList(
  velocity: TransactionVelocity,
  supply: SupplyOutlook,
  tenants: TenantSignals,
  positioning: SubjectPositioning
): string[] {
  const notes: string[] = [];
  if (velocity.momentum === 'FROZEN') notes.push('Transaction market frozen — exit liquidity at risk');
  if (velocity.momentum === 'SLOWING') notes.push('Transaction velocity slowing — negotiate discount');
  if (supply.supplyShockRisk === 'HIGH' || supply.supplyShockRisk === 'EXTREME') {
    notes.push(
      `Supply shock risk ${supply.supplyShockRisk.toLowerCase()} — ${(supply.next24mDeliverySqm / 1000).toFixed(0)}k sqm in next 24mo`
    );
  }
  if (tenants.signal === 'OUTFLOW') notes.push('Net tenant outflow in last 180 days — rent compression risk');
  if (positioning.positioningVerdict === 'DISTRESSED') notes.push('Subject pricing implies distress — diligence cap');
  if (positioning.positioningVerdict === 'PREMIUM') notes.push('Subject priced at submarket premium — justify vs comps');
  return notes;
}

function buildHeadline(
  label: string,
  velocity: TransactionVelocity,
  supply: SupplyOutlook,
  tenants: TenantSignals,
  positioning: SubjectPositioning
): string {
  return `${label}: liquidity ${velocity.momentum.toLowerCase()}, supply risk ${supply.supplyShockRisk.toLowerCase()}, tenant signal ${tenants.signal.toLowerCase()}, subject ${positioning.positioningVerdict.toLowerCase().replace('_', ' ')}.`;
}

export { percentile, distribution };
