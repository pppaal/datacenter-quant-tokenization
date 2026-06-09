import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWalletScreeningGate, isBlockingScreeningStatus } from '@/lib/services/aml/screening';

/**
 * The KYC→identity bridge must not whitelist a wallet on-chain on an APPROVED
 * KYC alone — it requires a CLEAR sanctions screening for that wallet, and is
 * fail-closed when no screening exists. These tests pin the gate logic that
 * `bridgeKycToChain` enforces.
 */

type FakeRow = { status: string; wallet: string; screenedAt: Date };

function fakeScreeningDb(rows: FakeRow[]): {
  screeningResult: { findFirst: (args: unknown) => Promise<{ status: string } | null> };
} {
  return {
    screeningResult: {
      async findFirst(args: unknown) {
        const where = (args as { where: { wallet: string } }).where;
        const matching = rows
          .filter((r) => r.wallet === where.wallet)
          .sort((a, b) => b.screenedAt.getTime() - a.screenedAt.getTime());
        return matching[0] ? { status: matching[0].status } : null;
      }
    }
  };
}

test('isBlockingScreeningStatus blocks every non-CLEAR status', () => {
  assert.equal(isBlockingScreeningStatus('CLEAR'), false);
  for (const status of ['POTENTIAL_MATCH', 'CONFIRMED_MATCH', 'ESCALATED', 'REJECTED']) {
    assert.equal(isBlockingScreeningStatus(status), true, status);
  }
  // Fail-closed casing + unknowns: only an exact CLEAR is non-blocking.
  assert.equal(isBlockingScreeningStatus('rejected'), true);
  assert.equal(isBlockingScreeningStatus(null), false); // absent != blocking-status; absence handled by gate
});

test('gate fails closed when the wallet has never been screened', async () => {
  const db = fakeScreeningDb([]);
  const gate = await getWalletScreeningGate('0xABC', db as never);
  assert.equal(gate.cleared, false);
  assert.equal(gate.reason, 'NOT_SCREENED');
  assert.equal(gate.status, null);
});

test('gate clears only on a CLEAR latest screening, and normalizes the wallet', async () => {
  const db = fakeScreeningDb([
    { wallet: '0xabc', status: 'CLEAR', screenedAt: new Date('2026-05-01') }
  ]);
  // Mixed-case input must match the lower-cased stored wallet.
  const gate = await getWalletScreeningGate('0xABC', db as never);
  assert.equal(gate.cleared, true);
  assert.equal(gate.reason, 'CLEAR');
});

test('gate blocks when the latest screening is a sanctions hit', async () => {
  const db = fakeScreeningDb([
    { wallet: '0xabc', status: 'CLEAR', screenedAt: new Date('2026-05-01') },
    { wallet: '0xabc', status: 'REJECTED', screenedAt: new Date('2026-05-10') }
  ]);
  const gate = await getWalletScreeningGate('0xabc', db as never);
  assert.equal(gate.cleared, false);
  assert.equal(gate.reason, 'SANCTIONS_BLOCKED');
  assert.equal(gate.status, 'REJECTED');
});
