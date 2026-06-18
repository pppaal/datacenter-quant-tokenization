import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFundPcap } from '@/lib/services/investor-reports';

const BILLION = 1_000_000_000;

/** Prisma.Decimal stand-in: only the `.toNumber()` contract `toNumber()` relies on. */
function decimal(value: number) {
  return { toNumber: () => value };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Build a fund fake matching the `fund.findUnique({ include: ... })` shape that
 * `buildFundPcap` issues. Money columns are deliberately a MIX of plain numbers
 * and Prisma.Decimal-like objects so the test locks in the Float|Decimal
 * coercion across the whole DB-shape → buildPcap mapping (the glue the pure
 * fund-nav unit tests don't exercise).
 */
function fundFake() {
  return {
    id: 'fund-1',
    name: 'Nexus Seoul Core Fund I',
    commitments: [
      {
        investorId: 'lp-a',
        investor: { code: 'LPA', name: 'Anchor LP', investorType: 'PENSION' },
        commitmentKrw: decimal(6 * BILLION),
        calledKrw: decimal(4 * BILLION),
        distributedKrw: decimal(1 * BILLION),
        recallableKrw: null,
        signedAt: daysAgo(400)
      },
      {
        investorId: 'lp-b',
        investor: { code: 'LPB', name: 'Co-invest LP', investorType: 'FAMILY_OFFICE' },
        // Plain-number tier (the other half of the schema) to prove both paths.
        commitmentKrw: 4 * BILLION,
        calledKrw: 2 * BILLION,
        distributedKrw: 0.5 * BILLION,
        recallableKrw: 0,
        signedAt: daysAgo(400)
      }
    ],
    capitalCalls: [
      {
        callDate: daysAgo(380),
        amountKrw: 6 * BILLION,
        allocations: [
          { investorId: 'lp-a', amountKrw: decimal(4 * BILLION) },
          { investorId: 'lp-b', amountKrw: 2 * BILLION }
        ]
      }
    ],
    distributions: [
      {
        distributionDate: daysAgo(120),
        amountKrw: 1.5 * BILLION,
        allocations: [
          { investorId: 'lp-a', amountKrw: decimal(1 * BILLION) },
          { investorId: 'lp-b', amountKrw: 0.5 * BILLION }
        ]
      }
    ],
    portfolio: {
      assets: [
        {
          asset: {
            id: 'asset-1',
            name: 'Yeoksam Hyperscale',
            assetCode: 'YHS',
            purchasePriceKrw: decimal(10 * BILLION),
            // Latest mark 12B (Decimal) — NAV must reflect this, not cost.
            valuations: [{ baseCaseValueKrw: decimal(12 * BILLION), createdAt: daysAgo(30) }]
          }
        }
      ]
    }
  };
}

function dbWith(fund: unknown) {
  return {
    fund: {
      findUnique: async (_args: unknown) => fund
    }
  } as never;
}

test('buildFundPcap maps the Prisma fund shape (Float AND Decimal columns) into correct PCAP money', async () => {
  const pcap = await buildFundPcap('fund-1', dbWith(fundFake()));

  // NAV = latest fair-value mark (12B), not cost basis (10B), fully marked.
  assert.equal(pcap.navKrw, 12 * BILLION);
  assert.equal(pcap.navUsedCostBasisFallback, false);

  // Fund-level rollups across both the Decimal LP and the plain-number LP.
  assert.equal(pcap.totals.committedKrw, 10 * BILLION);
  assert.equal(pcap.totals.calledKrw, 6 * BILLION);
  assert.equal(pcap.totals.distributedKrw, 1.5 * BILLION);
  assert.equal(pcap.totals.unfundedKrw, 4 * BILLION);
  assert.equal(pcap.totals.navShareKrw, 12 * BILLION);

  // DPI = dist/called, RVPI = nav/called, TVPI = (dist+nav)/called.
  assert.equal(pcap.totals.dpiMultiple, 0.25);
  assert.equal(pcap.totals.rvpiMultiple, 2);
  assert.equal(pcap.totals.tvpiMultiple, 2.25);

  // Per-LP NAV share is pro-rata by commitment: A = 60% → 7.2B, B = 40% → 4.8B.
  assert.equal(pcap.investors.length, 2);
  const a = pcap.investors.find((i) => i.investorId === 'lp-a');
  const b = pcap.investors.find((i) => i.investorId === 'lp-b');
  assert.ok(a && b);
  assert.equal(a.navShareKrw, 7.2 * BILLION);
  assert.equal(b.navShareKrw, 4.8 * BILLION);
  assert.equal(a.committedKrw, 6 * BILLION);
  assert.equal(a.investorName, 'Anchor LP');

  // Allocations carried investorId, so timing is per-LP (not pro-rata flagged).
  assert.equal(a.cashflowsAllocatedProRata, false);

  // Real dated calls + distros + terminal NAV → a finite positive IRR here.
  assert.ok(typeof pcap.totals.irrPct === 'number' && pcap.totals.irrPct > 0);
});

test('buildFundPcap falls back to cost basis and flags it when an asset is unvalued', async () => {
  const fund = fundFake();
  fund.portfolio.assets[0].asset.valuations = [];

  const pcap = await buildFundPcap('fund-1', dbWith(fund));

  // No valuation → cost basis (10B), flagged.
  assert.equal(pcap.navKrw, 10 * BILLION);
  assert.equal(pcap.navUsedCostBasisFallback, true);
  assert.deepEqual(pcap.navCostBasisFallbackAssets, ['YHS']);
});

test('buildFundPcap throws when the fund does not exist', async () => {
  await assert.rejects(() => buildFundPcap('missing', dbWith(null)), /Fund not found/);
});
