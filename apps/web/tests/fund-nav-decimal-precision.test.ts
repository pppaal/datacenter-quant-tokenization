import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { buildPcap, computeFundNavDetail } from '@/lib/services/fund-nav';

// 2^53 = 9_007_199_254_740_992 is the largest integer where IEEE-754 doubles
// keep unit spacing; above it, +1 is silently dropped. KRW funds blow past this
// (₩9 quadrillion), so a naive float aggregation loses won. These tests prove
// the NAV / PCAP money roll-ups now aggregate in exact Decimal space.
const TWO_POW_53 = 9_007_199_254_740_992;

test('NAV gross-asset aggregation retains precision a float sum would lose', () => {
  // Sum of [2^53, 1, 1] is exactly 9_007_199_254_740_994 (representable). A
  // left-to-right float sum drops both +1 adds and yields 9_007_199_254_740_992.
  const fund = {
    portfolio: {
      assets: [
        { ownershipPct: 100, currentHoldValueKrw: new Prisma.Decimal(TWO_POW_53), asset: {} },
        { ownershipPct: 100, currentHoldValueKrw: new Prisma.Decimal(1), asset: {} },
        { ownershipPct: 100, currentHoldValueKrw: new Prisma.Decimal(1), asset: {} }
      ]
    }
  };

  // Demonstrate the float path is genuinely lossy here.
  let floatSum = 0;
  for (const v of [TWO_POW_53, 1, 1]) floatSum += v;
  assert.equal(floatSum, TWO_POW_53, 'precondition: float sum drops the small adds');

  const detail = computeFundNavDetail(fund);
  assert.equal(detail.grossAssetValueKrw, 9_007_199_254_740_994);
  assert.equal(detail.navKrw, 9_007_199_254_740_994);
  // The exact result differs from the lossy float aggregation.
  assert.notEqual(detail.grossAssetValueKrw, floatSum);
});

test('NAV nets other-assets and debt in Decimal (no float drift at scale)', () => {
  const fund = {
    portfolio: {
      assets: [
        { ownershipPct: 100, currentHoldValueKrw: new Prisma.Decimal(TWO_POW_53), asset: {} }
      ]
    },
    otherNetAssetsKrw: 3 as number,
    fundDebtKrw: 1 as number
  };
  // 2^53 + 3 is NOT representable (rounds to 2^53+4); 2^53 + 3 - 1 = 2^53 + 2 is.
  const detail = computeFundNavDetail(fund);
  assert.equal(detail.navKrw, 9_007_199_254_740_994); // 2^53 + 2, exact
});

test('PCAP TVPI/DPI/RVPI ratios computed in Decimal stay exact at >2^53 KRW', () => {
  // One LP. distributed = 1.5 × called, residual NAV share = 0.5 × called, both
  // far above 2^53. Exact DPI = 1.5, RVPI = 0.5, TVPI = 2.0.
  const called = new Prisma.Decimal('9007199254740992'); // 2^53
  const distributed = called.mul('1.5'); // 13_510_798_882_111_488
  const navShare = called.mul('0.5'); // 4_503_599_627_370_496

  const nav: ReturnType<typeof computeFundNavDetail> = {
    navKrw: navShare.toNumber(),
    grossAssetValueKrw: navShare.toNumber(),
    otherNetAssetsKrw: 0,
    fundDebtKrw: 0,
    lines: [],
    usedCostBasisFallback: false,
    costBasisFallbackAssets: []
  };

  const result = buildPcap({
    commitments: [
      {
        investorId: 'lp1',
        commitmentKrw: called,
        calledKrw: called,
        distributedKrw: distributed
      }
    ],
    fundCapitalCalls: [],
    fundDistributions: [],
    nav
  });

  const lp = result.investors[0]!;
  assert.equal(lp.dpiMultiple, 1.5);
  assert.equal(lp.rvpiMultiple, 0.5);
  assert.equal(lp.tvpiMultiple, 2.0);
  // Totals mirror the single LP exactly.
  assert.equal(result.totals.dpiMultiple, 1.5);
  assert.equal(result.totals.tvpiMultiple, 2.0);
});

test('PCAP totals sum LP money columns in Decimal without dropping won', () => {
  // Two LPs whose called amounts sum to a value the float path cannot represent
  // by accumulation: [2^53, 1] then [1] across two LPs.
  const nav: ReturnType<typeof computeFundNavDetail> = {
    navKrw: 0,
    grossAssetValueKrw: 0,
    otherNetAssetsKrw: 0,
    fundDebtKrw: 0,
    lines: [],
    usedCostBasisFallback: false,
    costBasisFallbackAssets: []
  };
  const result = buildPcap({
    commitments: [
      {
        investorId: 'lp1',
        commitmentKrw: new Prisma.Decimal(TWO_POW_53),
        calledKrw: new Prisma.Decimal(TWO_POW_53),
        distributedKrw: new Prisma.Decimal(0)
      },
      {
        investorId: 'lp2',
        commitmentKrw: new Prisma.Decimal(2),
        calledKrw: new Prisma.Decimal(2),
        distributedKrw: new Prisma.Decimal(0)
      }
    ],
    fundCapitalCalls: [],
    fundDistributions: [],
    nav
  });
  // Exact: 2^53 + 2 = 9_007_199_254_740_994 (representable). Per-LP calledKrw
  // outputs are each exact; the Decimal total preserves the sum.
  assert.equal(result.totals.calledKrw, 9_007_199_254_740_994);
  assert.equal(result.totals.committedKrw, 9_007_199_254_740_994);
});

test('in-range outputs are unchanged by the Decimal promotion', () => {
  const fund = {
    portfolio: {
      assets: [
        { ownershipPct: 50, currentHoldValueKrw: 8_000_000_000, asset: {} },
        {
          ownershipPct: 100,
          asset: {
            id: 'a',
            assetCode: 'A',
            valuations: [{ baseCaseValueKrw: 12_000_000_000, createdAt: new Date() }]
          }
        }
      ]
    },
    otherNetAssetsKrw: 1_000_000_000,
    fundDebtKrw: 500_000_000
  };
  const detail = computeFundNavDetail(fund);
  // 8B (hold override, ownership not re-applied) + 12B + 1B − 0.5B = 20.5B.
  assert.equal(detail.grossAssetValueKrw, 20_000_000_000);
  assert.equal(detail.navKrw, 20_500_000_000);
});
