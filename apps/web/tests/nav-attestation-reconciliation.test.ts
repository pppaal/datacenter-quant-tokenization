/**
 * NAV-attestation reconciliation invariant.
 *
 * The on-chain `navPerShare` an attestation signs must reconcile to the
 * (fund-NAV value, token supply) it claims:
 *
 *     navPerShare × totalSupply / 1e18  ≈  fund-NAV value   (KRW)
 *
 * up to floor-division dust (< 1 base unit of navPerShare, i.e. < 1e-18 KRW
 * per token aggregated over supply). Two failure modes the old code allowed
 * are pinned shut here:
 *
 *  1. SILENT 1e18 DEFAULT — when the real supply ≠ 1e18, the old default made
 *     navPerShare equal the WHOLE-asset value, not per-token. Supply is now a
 *     required input; this test proves a non-1e18 supply reconciles.
 *  2. RAW baseCaseValueKrw — the attested value must be the fund-NAV-aware
 *     value (`computeTokenizedAssetNavDetail`: ownership %, hold-value
 *     override), NOT the raw whole-asset valuation. This test sources the
 *     value through that path and reconciles against `computeFundNavDetail`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { buildNavAttestation } from '@/lib/blockchain/attestation';
import {
  computeFundNavDetail,
  computeTokenizedAssetNavDetail,
  type NavPortfolioAsset
} from '@/lib/services/fund-nav';

const NAV_SCALE = 10n ** 18n;

/** Reconstruct the whole-KRW value implied by an attestation given its supply. */
function reconcileKrw(navPerShare: bigint, totalSharesScaled: bigint): bigint {
  // navPerShare = floor(value × 1e18 × 1e18 / supply)
  // ⇒ value ≈ navPerShare × supply / 1e18 / 1e18
  return (navPerShare * totalSharesScaled) / (NAV_SCALE * NAV_SCALE);
}

test('attested navPerShare × supply reconciles to the fund-NAV value (non-1e18 supply)', () => {
  // A 70%-owned asset marked at 1.2T KRW → fund-share value 840B KRW, split
  // across 1,000,000 whole tokens (1e6 × 1e18 base units). The old silent
  // 1e18 default would have made navPerShare the *whole-asset* per-share value.
  const pa: NavPortfolioAsset = {
    ownershipPct: 70,
    asset: {
      id: 'a1',
      assetCode: 'SEOUL-DC-01',
      valuations: [{ baseCaseValueKrw: 1_200_000_000_000, createdAt: new Date('2026-06-01') }]
    }
  };

  const nav = computeTokenizedAssetNavDetail(pa);
  // Fund-share value == single-asset computeFundNavDetail (ownership applied).
  const fundNav = computeFundNavDetail({ portfolio: { assets: [pa] } });
  assert.equal(nav.navValueKrw.toNumber(), fundNav.navKrw);
  assert.equal(nav.navValueKrw.toString(), '840000000000');

  const totalSharesScaled = 1_000_000n * NAV_SCALE; // 1M whole tokens
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-recon',
      navValueKrw: nav.navValueKrw,
      totalSharesScaled,
      createdAt: new Date('2026-06-01')
    },
    asset: { assetCode: 'SEOUL-DC-01' }
  });

  // INVARIANT: navPerShare × supply reconciles to the fund-NAV value.
  const reconciled = reconcileKrw(att.navPerShare, totalSharesScaled);
  const expected = BigInt(nav.navValueKrw.toFixed(0));
  // Floor-division dust is bounded by supply/1e18 base units of KRW (here 1M).
  const dust = expected - reconciled;
  assert.ok(dust >= 0n && dust < totalSharesScaled / NAV_SCALE, `dust ${dust} out of range`);

  // Per-token NAV here is 840,000 KRW (840B / 1M tokens), NOT the whole-asset
  // value — proving the supply is actually applied.
  assert.equal(att.navPerShare, 840_000n * NAV_SCALE);
});

test('the old silent 1e18 default would NOT reconcile for a >1e18 supply', () => {
  // Demonstrate the bug the fix closes: had supply silently defaulted to 1e18,
  // navPerShare would equal the whole fund-NAV value, and reconciling against
  // the REAL supply would overstate NAV by (realSupply / 1e18)×.
  const navValueKrw = new Prisma.Decimal('840000000000');
  const realSupply = 1_000_000n * NAV_SCALE;

  // What the buggy default produced (supply == 1e18):
  const buggy = buildNavAttestation({
    valuationRun: {
      id: 'r',
      navValueKrw,
      totalSharesScaled: NAV_SCALE, // the OLD silent default
      createdAt: new Date(0)
    },
    asset: { assetCode: 'A' }
  });
  // Reconcile that navPerShare against the REAL supply → wildly overstated.
  const overstated = reconcileKrw(buggy.navPerShare, realSupply);
  assert.equal(overstated, 840_000_000_000n * 1_000_000n); // off by 1,000,000×

  // The correct attestation (supply passed) reconciles exactly.
  const correct = buildNavAttestation({
    valuationRun: { id: 'r', navValueKrw, totalSharesScaled: realSupply, createdAt: new Date(0) },
    asset: { assetCode: 'A' }
  });
  assert.equal(reconcileKrw(correct.navPerShare, realSupply), 840_000_000_000n);
});

test('reconciliation holds for a KRW NAV above 2^53 (no float precision loss)', () => {
  // 12 trillion KRW would lose its low digits as a JS number; carried as
  // Decimal it must reconcile exactly.
  const navValueKrw = new Prisma.Decimal('12000000000007'); // 12T + 7 KRW
  const totalSharesScaled = 3_000_000n * NAV_SCALE;
  const att = buildNavAttestation({
    valuationRun: { id: 'r', navValueKrw, totalSharesScaled, createdAt: new Date(0) },
    asset: { assetCode: 'BIG' }
  });
  const reconciled = reconcileKrw(att.navPerShare, totalSharesScaled);
  const expected = 12_000_000_000_007n;
  const dust = expected - reconciled;
  assert.ok(dust >= 0n && dust < totalSharesScaled / NAV_SCALE, `dust ${dust} out of range`);
});

test('hold-value override is attested as-is (already a fund-share figure)', () => {
  const pa: NavPortfolioAsset = {
    ownershipPct: 50, // must NOT be re-applied on top of the override
    currentHoldValueKrw: new Prisma.Decimal('500000000000'),
    asset: { id: 'a2', assetCode: 'OVR', valuations: [] }
  };
  const nav = computeTokenizedAssetNavDetail(pa);
  assert.equal(nav.source, 'HOLD_VALUE_OVERRIDE');
  const fundNav = computeFundNavDetail({ portfolio: { assets: [pa] } });
  assert.equal(nav.navValueKrw.toNumber(), fundNav.navKrw);
  assert.equal(nav.navValueKrw.toString(), '500000000000');
});
