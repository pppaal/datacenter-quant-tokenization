import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPcap,
  computeFundNavDetail,
  computeFundNavKrw,
  computeXirr,
  type FundNavResult
} from '@/lib/services/fund-nav';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// FIX 1 — fair-value NAV
// ---------------------------------------------------------------------------

test('NAV = sum of LATEST asset valuations, reflecting gains AND losses', () => {
  const fund = {
    portfolio: {
      assets: [
        {
          // Gainer: cost 10B, latest mark 14B (uses the most recent run, not cost).
          asset: {
            id: 'a1',
            assetCode: 'A1',
            purchasePriceKrw: 10_000_000_000,
            valuations: [
              { baseCaseValueKrw: 12_000_000_000, createdAt: daysAgo(200) },
              { baseCaseValueKrw: 14_000_000_000, createdAt: daysAgo(10) }
            ]
          }
        },
        {
          // Loser: cost 8B, latest mark 6B.
          asset: {
            id: 'a2',
            assetCode: 'A2',
            purchasePriceKrw: 8_000_000_000,
            valuations: [{ baseCaseValueKrw: 6_000_000_000, createdAt: daysAgo(5) }]
          }
        }
      ]
    }
  };

  const result = computeFundNavDetail(fund);
  assert.equal(result.navKrw, 14_000_000_000 + 6_000_000_000); // 20B, NOT cost (18B)
  assert.equal(result.usedCostBasisFallback, false);
  // NAV != called - distributed proxy: it is purely fair value here.
  assert.equal(computeFundNavKrw(fund), 20_000_000_000);
});

test('TVPI/RVPI reflect gains and losses through fair-value NAV', () => {
  const called = 18_000_000_000;
  const distributed = 2_000_000_000;
  // Win case: NAV 24B (gain) -> TVPI = (24 + 2)/18
  const navWin = computeFundNavKrw({
    portfolio: {
      assets: [
        {
          asset: {
            id: 'a',
            valuations: [{ baseCaseValueKrw: 24_000_000_000, createdAt: daysAgo(1) }]
          }
        }
      ]
    }
  });
  // Loss case: NAV 12B (loss) -> TVPI = (12 + 2)/18
  const navLoss = computeFundNavKrw({
    portfolio: {
      assets: [
        {
          asset: {
            id: 'a',
            valuations: [{ baseCaseValueKrw: 12_000_000_000, createdAt: daysAgo(1) }]
          }
        }
      ]
    }
  });
  const tvpiWin = (navWin + distributed) / called;
  const tvpiLoss = (navLoss + distributed) / called;
  assert.ok(tvpiWin > 1, 'gain produces TVPI > 1');
  assert.ok(tvpiLoss < 1, 'loss produces TVPI < 1');
  // RVPI (NAV/called) differs between win and loss — proving it is mark-driven.
  assert.ok(navWin / called > navLoss / called);
});

test('cost-basis fallback is used AND flagged when no valuation exists', () => {
  const result = computeFundNavDetail({
    portfolio: {
      assets: [
        {
          asset: {
            id: 'a1',
            assetCode: 'MARKED',
            valuations: [{ baseCaseValueKrw: 5_000_000_000, createdAt: daysAgo(1) }],
            purchasePriceKrw: 4_000_000_000
          }
        },
        {
          asset: {
            id: 'a2',
            assetCode: 'UNMARKED',
            valuations: [],
            purchasePriceKrw: 3_000_000_000
          }
        }
      ]
    }
  });
  assert.equal(result.navKrw, 5_000_000_000 + 3_000_000_000);
  assert.equal(result.usedCostBasisFallback, true);
  assert.deepEqual(result.costBasisFallbackAssets, ['UNMARKED']);
  const unmarkedLine = result.lines.find((l) => l.assetCode === 'UNMARKED');
  assert.equal(unmarkedLine?.source, 'COST_BASIS_FALLBACK');
});

test('NAV applies ownership pct and nets fund debt + adds other net assets', () => {
  const result = computeFundNavDetail({
    portfolio: {
      assets: [
        {
          ownershipPct: 50,
          asset: {
            id: 'a1',
            valuations: [{ baseCaseValueKrw: 20_000_000_000, createdAt: daysAgo(1) }]
          }
        }
      ]
    },
    otherNetAssetsKrw: 1_000_000_000,
    fundDebtKrw: 3_000_000_000
  });
  // 20B * 50% = 10B + 1B other - 3B debt = 8B
  assert.equal(result.navKrw, 8_000_000_000);
});

// ---------------------------------------------------------------------------
// XIRR
// ---------------------------------------------------------------------------

test('computeXirr recovers a known annual rate on dated flows', () => {
  // -100 at t0, +110 exactly one year later => 10%.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date(t0.getTime() + YEAR_MS);
  const irr = computeXirr([
    { date: t0, amountKrw: -100 },
    { date: t1, amountKrw: 110 }
  ]);
  assert.ok(irr != null && Math.abs(irr - 10) < 0.1, `expected ~10%, got ${irr}`);
});

test('computeXirr returns null without a sign change', () => {
  assert.equal(
    computeXirr([
      { date: daysAgo(365), amountKrw: -100 },
      { date: daysAgo(1), amountKrw: -50 }
    ]),
    null
  );
});

// ---------------------------------------------------------------------------
// FIX 2 — per-LP PCAP
// ---------------------------------------------------------------------------

function navFixture(navKrw: number): FundNavResult {
  return {
    navKrw,
    grossAssetValueKrw: navKrw,
    otherNetAssetsKrw: 0,
    fundDebtKrw: 0,
    lines: [],
    usedCostBasisFallback: false,
    costBasisFallbackAssets: []
  };
}

test('per-LP PCAP totals reconcile to the fund total across LPs', () => {
  const nav = navFixture(30_000_000_000);
  const pcap = buildPcap({
    commitments: [
      {
        investorId: 'lp1',
        commitmentKrw: 60_000_000_000,
        calledKrw: 40_000_000_000,
        distributedKrw: 10_000_000_000
      },
      {
        investorId: 'lp2',
        commitmentKrw: 40_000_000_000,
        calledKrw: 30_000_000_000,
        distributedKrw: 5_000_000_000
      }
    ],
    fundCapitalCalls: [{ date: daysAgo(365), amountKrw: 70_000_000_000 }],
    fundDistributions: [{ date: daysAgo(30), amountKrw: 15_000_000_000 }],
    nav
  });

  const sumCalled = pcap.investors.reduce((s, i) => s + i.calledKrw, 0);
  const sumDistributed = pcap.investors.reduce((s, i) => s + i.distributedKrw, 0);
  const sumUnfunded = pcap.investors.reduce((s, i) => s + i.unfundedKrw, 0);
  const sumNavShare = pcap.investors.reduce((s, i) => s + i.navShareKrw, 0);

  assert.equal(sumCalled, 70_000_000_000);
  assert.equal(sumDistributed, 15_000_000_000);
  assert.equal(sumUnfunded, 100_000_000_000 - 70_000_000_000);
  // Pro-rata NAV share sums to fund NAV.
  assert.ok(Math.abs(sumNavShare - nav.navKrw) < 1, `nav share ${sumNavShare} ~= ${nav.navKrw}`);
  // LP1 holds 60% of commitments -> 60% of NAV.
  const lp1 = pcap.investors.find((i) => i.investorId === 'lp1')!;
  assert.ok(Math.abs(lp1.navShareKrw - 0.6 * nav.navKrw) < 1);
  assert.equal(lp1.cashflowsAllocatedProRata, true);
});

test('per-LP IRR/TVPI/DPI/RVPI correct on a known dated single-LP fixture', () => {
  // One LP. Called 100 a year ago, distributed 20 today, ending NAV 110 today.
  // TVPI = (20 + 110)/100 = 1.3 ; DPI = 0.2 ; RVPI = 1.1.
  const t0 = daysAgo(365);
  const nav = navFixture(110);
  const pcap = buildPcap({
    commitments: [
      { investorId: 'lp1', commitmentKrw: 100, calledKrw: 100, distributedKrw: 20, signedAt: t0 }
    ],
    fundCapitalCalls: [{ date: t0, amountKrw: 100, investorId: 'lp1' }],
    fundDistributions: [{ date: daysAgo(0), amountKrw: 20, investorId: 'lp1' }],
    nav,
    asOf: new Date()
  });

  const lp = pcap.investors[0]!;
  assert.equal(lp.navShareKrw, 110);
  assert.ok(Math.abs(lp.tvpiMultiple - 1.3) < 1e-6, `TVPI ${lp.tvpiMultiple}`);
  assert.ok(Math.abs(lp.dpiMultiple - 0.2) < 1e-6, `DPI ${lp.dpiMultiple}`);
  assert.ok(Math.abs(lp.rvpiMultiple - 1.1) < 1e-6, `RVPI ${lp.rvpiMultiple}`);
  assert.equal(lp.cashflowsAllocatedProRata, false); // per-LP allocations present
  // IRR: -100 at t0, +20 + +110 = +130 today (1yr) => 30%.
  assert.ok(lp.irrPct != null && Math.abs(lp.irrPct - 30) < 0.5, `IRR ${lp.irrPct}`);
});

test('an underwater (negative) NAV floors RVPI/TVPI at 0, never negative', () => {
  // Fund debt swamps assets → negative NAV. RVPI/TVPI are value-to-paid-in
  // multiples and cannot be negative under LP limited liability; they floor at 0
  // (the loss shows up as TVPI well below 1, not as a negative multiple).
  const nav = navFixture(-50_000_000_000);
  const pcap = buildPcap({
    commitments: [
      {
        investorId: 'lp1',
        commitmentKrw: 100_000_000_000,
        calledKrw: 100_000_000_000,
        distributedKrw: 0
      }
    ],
    fundCapitalCalls: [{ date: daysAgo(365), amountKrw: 100_000_000_000 }],
    fundDistributions: [],
    nav
  });

  const lp = pcap.investors[0]!;
  // Signed NAV share is preserved for display, but the multiples floor at 0.
  assert.ok(lp.navShareKrw < 0, 'signed NAV share stays negative for display');
  assert.equal(lp.rvpiMultiple, 0);
  assert.equal(lp.tvpiMultiple, 0);
  assert.equal(lp.dpiMultiple, 0);
  // Fund-level totals floor too.
  assert.equal(pcap.totals.rvpiMultiple, 0);
  assert.equal(pcap.totals.tvpiMultiple, 0);
});

test('a partial loss keeps TVPI below 1 but non-negative', () => {
  // Called 100, distributed 10, NAV 30 → TVPI = (10 + 30)/100 = 0.4, RVPI 0.3.
  const nav = navFixture(30_000_000_000);
  const pcap = buildPcap({
    commitments: [
      {
        investorId: 'lp1',
        commitmentKrw: 100_000_000_000,
        calledKrw: 100_000_000_000,
        distributedKrw: 10_000_000_000
      }
    ],
    fundCapitalCalls: [{ date: daysAgo(365), amountKrw: 100_000_000_000 }],
    fundDistributions: [{ date: daysAgo(30), amountKrw: 10_000_000_000 }],
    nav
  });
  const lp = pcap.investors[0]!;
  assert.ok(Math.abs(lp.rvpiMultiple - 0.3) < 1e-6);
  assert.ok(Math.abs(lp.tvpiMultiple - 0.4) < 1e-6);
});

test('per-LP allocations override pro-rata when present', () => {
  const nav = navFixture(0);
  const pcap = buildPcap({
    commitments: [
      { investorId: 'lp1', commitmentKrw: 50, calledKrw: 80, distributedKrw: 0 },
      { investorId: 'lp2', commitmentKrw: 50, calledKrw: 20, distributedKrw: 0 }
    ],
    // Equal commitments but a lopsided 80/20 actual call allocation.
    fundCapitalCalls: [
      { date: daysAgo(100), amountKrw: 80, investorId: 'lp1' },
      { date: daysAgo(100), amountKrw: 20, investorId: 'lp2' }
    ],
    fundDistributions: [],
    nav
  });
  const lp1 = pcap.investors.find((i) => i.investorId === 'lp1')!;
  assert.equal(lp1.cashflowsAllocatedProRata, false);
});
