import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompetitiveIntelligence,
  distribution,
  percentile,
  type CompetitiveIntelInput,
  type CompTransaction,
  type PipelineDelivery,
  type TenantMove
} from '@/lib/services/research/competitive-intelligence';

const asOf = new Date('2026-04-23T00:00:00Z');

function daysAgo(n: number): Date {
  return new Date(asOf.getTime() - n * 24 * 60 * 60 * 1000);
}

function daysAhead(n: number): Date {
  return new Date(asOf.getTime() + n * 24 * 60 * 60 * 1000);
}

const transactions: CompTransaction[] = [
  {
    id: 'T1',
    dealDate: daysAgo(30),
    priceKrw: 120_000_000_000,
    gfaSqm: 10_000,
    capRatePct: 5.2,
    pricePerSqmKrw: 12_000_000,
    buyerName: 'Fund A',
    sellerName: 'Sponsor X',
    assetLabel: 'Teheran Tower'
  },
  {
    id: 'T2',
    dealDate: daysAgo(75),
    priceKrw: 95_000_000_000,
    gfaSqm: 8_500,
    capRatePct: 5.5,
    pricePerSqmKrw: 11_200_000,
    buyerName: 'REIT Y',
    sellerName: 'Owner Z',
    assetLabel: 'GBD One'
  },
  {
    id: 'T3',
    dealDate: daysAgo(140),
    priceKrw: 150_000_000_000,
    gfaSqm: 12_000,
    capRatePct: 5.4,
    pricePerSqmKrw: 12_500_000,
    buyerName: 'Fund B',
    sellerName: 'Family Office',
    assetLabel: 'Samsung Plaza II'
  },
  {
    id: 'T4',
    dealDate: daysAgo(210),
    priceKrw: 80_000_000_000,
    gfaSqm: 7_000,
    capRatePct: 5.7,
    pricePerSqmKrw: 11_400_000,
    buyerName: 'Institutional Buyer',
    sellerName: 'Developer',
    assetLabel: 'Gangnam Spire'
  },
  {
    id: 'T5',
    dealDate: daysAgo(300),
    priceKrw: 60_000_000_000,
    gfaSqm: 5_500,
    capRatePct: 5.9,
    pricePerSqmKrw: 10_900_000,
    buyerName: 'Private Buyer',
    sellerName: 'Corporate Owner',
    assetLabel: 'Seocho Mid'
  }
];

const rents = [
  {
    id: 'R1',
    observationDate: daysAgo(60),
    monthlyRentKrwPerSqm: 68_000,
    occupancyPct: 94,
    assetLabel: 'Teheran Tower'
  },
  {
    id: 'R2',
    observationDate: daysAgo(40),
    monthlyRentKrwPerSqm: 72_000,
    occupancyPct: 97,
    assetLabel: 'GBD One'
  },
  {
    id: 'R3',
    observationDate: daysAgo(120),
    monthlyRentKrwPerSqm: 65_000,
    occupancyPct: 91,
    assetLabel: 'Samsung Plaza II'
  }
];

const pipeline: PipelineDelivery[] = [
  {
    id: 'P1',
    projectName: 'Gangnam Cube',
    expectedDeliveryDate: daysAhead(200),
    expectedGfaSqm: 25_000,
    developer: 'Big Developer',
    stage: 'UNDER_CONSTRUCTION'
  },
  {
    id: 'P2',
    projectName: 'Teheran Skyline',
    expectedDeliveryDate: daysAhead(400),
    expectedGfaSqm: 40_000,
    developer: 'Major SPC',
    stage: 'PLANNED'
  },
  {
    id: 'P3',
    projectName: 'Delivered Asset',
    expectedDeliveryDate: daysAgo(30),
    expectedGfaSqm: 15_000,
    developer: 'Done',
    stage: 'DELIVERED'
  }
];

const tenantMoves: TenantMove[] = [
  {
    id: 'M1',
    observationDate: daysAgo(30),
    tenantName: 'Samsung SDS',
    moveType: 'MOVED_IN',
    areaSqm: 5_000,
    fromAssetLabel: 'Teheran Tower',
    toAssetLabel: 'GBD One'
  },
  {
    id: 'M2',
    observationDate: daysAgo(60),
    tenantName: 'Naver',
    moveType: 'EXPANSION',
    areaSqm: 2_000,
    fromAssetLabel: null,
    toAssetLabel: 'Samsung Plaza II'
  },
  {
    id: 'M3',
    observationDate: daysAgo(90),
    tenantName: 'Kakao',
    moveType: 'MOVED_OUT',
    areaSqm: 3_000,
    fromAssetLabel: 'Gangnam Spire',
    toAssetLabel: null
  }
];

const baseInput: CompetitiveIntelInput = {
  submarketLabel: '서울 강남 A급 오피스',
  asOf,
  subject: {
    assetLabel: 'Subject Tower',
    currentCapRatePct: 5.6,
    currentMonthlyRentKrwPerSqm: 66_000,
    currentOccupancyPct: 92,
    gfaSqm: 9_000
  },
  transactions,
  rents,
  pipeline,
  tenantMoves,
  submarketExistingInventorySqm: 800_000
};

test('percentile: interpolates between sorted values', () => {
  const vals = [10, 20, 30, 40, 50];
  assert.equal(percentile(vals, 50), 30);
  assert.equal(percentile(vals, 0), 10);
  assert.equal(percentile(vals, 100), 50);
});

test('distribution: returns null for empty input', () => {
  assert.equal(distribution([]), null);
  const d = distribution([1, 2, 3, 4, 5])!;
  assert.equal(d.median, 3);
});

test('buildCompetitiveIntelligence: populates all distribution blocks', () => {
  const report = buildCompetitiveIntelligence(baseInput);
  assert.ok(report.capRateDistribution);
  assert.ok(report.rentDistribution);
  assert.ok(report.pricePerSqmDistribution);
  assert.equal(report.compCounts.transactions, 5);
});

test('buildCompetitiveIntelligence: transaction velocity buckets are correct', () => {
  const report = buildCompetitiveIntelligence(baseInput);
  assert.equal(report.transactionVelocity.last90dCount, 2);
  assert.equal(report.transactionVelocity.last180dCount, 3);
  assert.equal(report.transactionVelocity.last365dCount, 5);
  assert.ok(report.transactionVelocity.trailing12mTotalKrw > 0);
});

test('buildCompetitiveIntelligence: supply outlook counts only forward pipeline', () => {
  const report = buildCompetitiveIntelligence(baseInput);
  // delivered (past date) excluded; 200d & 400d included in 24mo window
  assert.equal(report.supplyOutlook.next12mDeliverySqm, 25_000);
  assert.equal(report.supplyOutlook.next24mDeliverySqm, 65_000);
  assert.ok(report.supplyOutlook.pipelineAsPctOfInventory! > 0);
});

test('buildCompetitiveIntelligence: tenant signal classifies INFLOW correctly', () => {
  const report = buildCompetitiveIntelligence(baseInput);
  assert.equal(report.tenantSignals.last180dMoveInCount, 2);
  assert.equal(report.tenantSignals.last180dMoveOutCount, 1);
  assert.ok(['INFLOW', 'BALANCED'].includes(report.tenantSignals.signal));
});

test('buildCompetitiveIntelligence: subject positioning relates to cap-rate median', () => {
  const report = buildCompetitiveIntelligence(baseInput);
  // subject 5.6% vs median 5.5% → 10bps wide of median = IN_LINE (threshold 30bps)
  assert.equal(report.subjectPositioning.positioningVerdict, 'IN_LINE');
  assert.ok(report.subjectPositioning.capRateVsMedianBps !== null);
});

test('buildCompetitiveIntelligence: premium subject classified correctly', () => {
  const report = buildCompetitiveIntelligence({
    ...baseInput,
    subject: { ...baseInput.subject, currentCapRatePct: 4.8 }
  });
  assert.equal(report.subjectPositioning.positioningVerdict, 'PREMIUM');
});

test('buildCompetitiveIntelligence: distressed subject flagged', () => {
  const report = buildCompetitiveIntelligence({
    ...baseInput,
    subject: { ...baseInput.subject, currentCapRatePct: 7.5 }
  });
  assert.equal(report.subjectPositioning.positioningVerdict, 'DISTRESSED');
  assert.ok(report.watchList.some((w) => w.includes('distress')));
});

test('buildCompetitiveIntelligence: insufficient comps returns safe verdict', () => {
  const report = buildCompetitiveIntelligence({
    ...baseInput,
    transactions: [transactions[0]!]
  });
  assert.equal(report.subjectPositioning.positioningVerdict, 'INSUFFICIENT_COMPS');
});

test('buildCompetitiveIntelligence: extreme supply shock flagged', () => {
  const heavyPipeline: PipelineDelivery[] = Array.from({ length: 6 }, (_, i) => ({
    id: `HEAVY-${i}`,
    projectName: `Mega Tower ${i}`,
    expectedDeliveryDate: daysAhead(180 + i * 20),
    expectedGfaSqm: 30_000,
    developer: 'Giant',
    stage: 'UNDER_CONSTRUCTION' as const
  }));
  const report = buildCompetitiveIntelligence({
    ...baseInput,
    pipeline: heavyPipeline,
    submarketExistingInventorySqm: 800_000
  });
  assert.equal(report.supplyOutlook.supplyShockRisk, 'EXTREME');
  assert.ok(report.watchList.some((w) => w.includes('Supply shock')));
});

test('buildCompetitiveIntelligence: frozen market surfaces liquidity warning', () => {
  const report = buildCompetitiveIntelligence({
    ...baseInput,
    transactions: []
  });
  assert.equal(report.transactionVelocity.momentum, 'FROZEN');
  assert.ok(report.watchList.some((w) => w.includes('frozen')));
});
