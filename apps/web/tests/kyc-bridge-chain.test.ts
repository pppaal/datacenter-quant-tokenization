import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeKycToChain, type BridgeKycChainDeps } from '@/lib/services/kyc/bridge';

/**
 * Orchestration tests for `bridgeKycToChain`: that it routes APPROVED/REVOKED/
 * PENDING to the right on-chain action AND enforces the fail-closed sanctions
 * gate before any write that adds/keeps a wallet on the registry — while never
 * gating removals. The gate primitive itself is covered in
 * `kyc-bridge-screening-gate.test.ts`; here the on-chain + gate collaborators
 * are injected so we assert the bridge's control flow without a chain.
 */

type Calls = {
  register: Array<{ wallet: string; countryCode: number }>;
  update: Array<{ wallet: string; countryCode: number }>;
  remove: string[];
  gate: string[];
  dbUpdate: unknown[];
};

function harness(opts: {
  record: { id: string; status: string; wallet: string; countryCode: number } | null;
  deployment?: unknown; // null → simulate missing deployment
  identity: { registered: boolean; countryCode: number };
  gateCleared: boolean;
}) {
  const calls: Calls = { register: [], update: [], remove: [], gate: [], dbUpdate: [] };

  const db = {
    kycRecord: {
      findUnique: async () => opts.record,
      update: async (args: unknown) => {
        calls.dbUpdate.push(args);
        return {};
      }
    }
  } as never;

  const hasDeployment = opts.deployment !== null;
  const deps: Partial<BridgeKycChainDeps> = {
    getDeploymentByAssetId: async () => (hasDeployment ? ({ id: 'tok_1' } as never) : null),
    toDeploymentRow: () => ({ identityRegistryAddress: '0xreg' } as never),
    getIdentity: async () => ({
      registered: opts.identity.registered,
      countryCode: opts.identity.countryCode,
      registeredAt: 0
    }),
    registerIdentity: async (_d, input) => {
      calls.register.push(input);
      return '0xREGISTER' as never;
    },
    updateCountry: async (_d, input) => {
      calls.update.push(input);
      return '0xUPDATE' as never;
    },
    removeIdentity: async (_d, wallet) => {
      calls.remove.push(wallet);
      return '0xREMOVE' as never;
    },
    getWalletScreeningGate: async (wallet) => {
      calls.gate.push(wallet);
      return opts.gateCleared
        ? { cleared: true, status: 'CLEAR', reason: 'CLEAR' }
        : { cleared: false, status: null, reason: 'NOT_SCREENED' };
    }
  };

  return { calls, db, deps };
}

const KR = 410;
const US = 840;

test('APPROVED + not registered + sanctions CLEAR → registerIdentity, record stamped', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    identity: { registered: false, countryCode: 0 },
    gateCleared: true
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'register');
  assert.equal(result.txHash, '0xREGISTER');
  assert.deepEqual(calls.register, [{ wallet: '0xabc', countryCode: KR }]);
  assert.equal(calls.gate.length, 1); // gate consulted before the write
  assert.equal(calls.dbUpdate.length, 1); // record stamped with bridge tx
});

test('APPROVED + not registered + NOT screened → throws, NO registerIdentity', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    identity: { registered: false, countryCode: 0 },
    gateCleared: false
  });

  await assert.rejects(
    () => bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps),
    /Sanctions screening required/
  );
  // Fail-closed: the gate blocked the write, so nothing hit the chain or the DB.
  assert.equal(calls.register.length, 0);
  assert.equal(calls.dbUpdate.length, 0);
});

test('APPROVED + registered + different country + CLEAR → updateCountry', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    identity: { registered: true, countryCode: US },
    gateCleared: true
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'updateCountry');
  assert.equal(result.txHash, '0xUPDATE');
  assert.deepEqual(calls.update, [{ wallet: '0xabc', countryCode: KR }]);
  assert.equal(calls.gate.length, 1); // re-whitelisting a country change is gated too
  assert.equal(calls.register.length, 0);
});

test('APPROVED + registered + different country + NOT screened → throws, NO updateCountry', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    identity: { registered: true, countryCode: US },
    gateCleared: false
  });

  await assert.rejects(
    () => bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps),
    /Sanctions screening required/
  );
  assert.equal(calls.update.length, 0);
  assert.equal(calls.dbUpdate.length, 0);
});

test('APPROVED + registered + same country → noop, gate NOT consulted, no write', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    identity: { registered: true, countryCode: KR },
    gateCleared: true
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'noop:already-registered');
  assert.equal(result.txHash, null);
  assert.equal(calls.gate.length, 0); // no write needed → gate is not even queried
  assert.equal(calls.register.length, 0);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.dbUpdate.length, 0);
});

test('REVOKED + registered → removeIdentity, removals are NEVER gated', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'REVOKED', wallet: '0xabc', countryCode: KR },
    identity: { registered: true, countryCode: KR },
    gateCleared: false // even a blocked/absent screening must not stop a removal
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'remove');
  assert.equal(result.txHash, '0xREMOVE');
  assert.deepEqual(calls.remove, ['0xabc']);
  assert.equal(calls.gate.length, 0); // pulling a wallet off-chain is always allowed
  assert.equal(calls.dbUpdate.length, 1);
});

test('REVOKED + not registered → noop, no chain write', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'REVOKED', wallet: '0xabc', countryCode: KR },
    identity: { registered: false, countryCode: 0 },
    gateCleared: true
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'noop:already-unregistered');
  assert.equal(result.txHash, null);
  assert.equal(calls.remove.length, 0);
  assert.equal(calls.dbUpdate.length, 0);
});

test('PENDING → noop, never touches the chain', async () => {
  const { calls, db, deps } = harness({
    record: { id: 'k1', status: 'PENDING', wallet: '0xabc', countryCode: KR },
    identity: { registered: false, countryCode: 0 },
    gateCleared: true
  });

  const result = await bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps);

  assert.equal(result.action, 'noop:pending');
  assert.equal(result.txHash, null);
  assert.equal(calls.gate.length, 0);
  assert.equal(calls.register.length, 0);
});

test('missing KycRecord throws', async () => {
  const { db, deps } = harness({
    record: null,
    identity: { registered: false, countryCode: 0 },
    gateCleared: true
  });
  await assert.rejects(
    () => bridgeKycToChain({ kycRecordId: 'missing', assetId: 'a1', db }, deps),
    /KycRecord missing not found/
  );
});

test('missing tokenization deployment throws', async () => {
  const { db, deps } = harness({
    record: { id: 'k1', status: 'APPROVED', wallet: '0xabc', countryCode: KR },
    deployment: null,
    identity: { registered: false, countryCode: 0 },
    gateCleared: true
  });
  await assert.rejects(
    () => bridgeKycToChain({ kycRecordId: 'k1', assetId: 'a1', db }, deps),
    /No TokenizedAsset deployment/
  );
});
