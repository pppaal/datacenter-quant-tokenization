import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMockTxHash, isTokenizationMockMode } from '@/lib/blockchain/mock-mode';

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key]!;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('isTokenizationMockMode honors truthy env flags', () => {
  const cast = (env: Record<string, string>) => env as unknown as NodeJS.ProcessEnv;
  assert.equal(isTokenizationMockMode(cast({ BLOCKCHAIN_MOCK_MODE: 'true' })), true);
  assert.equal(isTokenizationMockMode(cast({ BLOCKCHAIN_MOCK_MODE: '1' })), true);
  assert.equal(isTokenizationMockMode(cast({ BLOCKCHAIN_MOCK_MODE: 'YES' })), true);
  assert.equal(isTokenizationMockMode(cast({ BLOCKCHAIN_MOCK_MODE: 'false' })), false);
  assert.equal(isTokenizationMockMode(cast({ BLOCKCHAIN_MOCK_MODE: '' })), false);
  assert.equal(isTokenizationMockMode(cast({})), false);
});

test('isTokenizationMockMode hard-blocks when NODE_ENV is production', () => {
  assert.throws(
    () =>
      isTokenizationMockMode({
        BLOCKCHAIN_MOCK_MODE: 'true',
        NODE_ENV: 'production'
      } as unknown as NodeJS.ProcessEnv),
    /must not be enabled in production/
  );
});

test('buildMockTxHash returns 32-byte 0x hex deterministically', () => {
  const a = buildMockTxHash('mint', '0xtoken', '0xrecipient', '1000');
  const b = buildMockTxHash('mint', '0xtoken', '0xrecipient', '1000');
  const c = buildMockTxHash('mint', '0xtoken', '0xrecipient', '2000');
  assert.match(a, /^0x[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('buildMockTxHash skips null and undefined parts', () => {
  const direct = buildMockTxHash('register', '0xagent', '0xwallet');
  const padded = buildMockTxHash('register', '0xagent', null, '0xwallet', undefined);
  assert.equal(direct, padded);
});

test('mock-mode token-issuance returns deterministic txHashes', async () => {
  await withEnv({ BLOCKCHAIN_MOCK_MODE: 'true', NODE_ENV: 'development' }, async () => {
    const { mintTokens, burnTokens, forceTransfer, pauseToken, unpauseToken } =
      await import('@/lib/services/onchain/token-issuance');
    const deployment = {
      chainId: 31337,
      tokenAddress: '0x1234567890abcdef1234567890abcdef12345678' as const,
      identityRegistryAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const,
      complianceAddress: '0x1111111111222222222233333333334444444444' as const,
      countryRestrictModuleAddress: null as null
    };
    const recipient = '0x9999999999999999999999999999999999999999';
    const sender = '0x8888888888888888888888888888888888888888';

    const mintHash1 = await mintTokens(deployment, { to: recipient, amount: '1000' });
    const mintHash2 = await mintTokens(deployment, { to: recipient, amount: '1000' });
    const mintHashDifferent = await mintTokens(deployment, { to: recipient, amount: '2000' });
    assert.match(mintHash1, /^0x[a-f0-9]{64}$/);
    assert.equal(mintHash1, mintHash2);
    assert.notEqual(mintHash1, mintHashDifferent);

    const burnHash = await burnTokens(deployment, { from: recipient, amount: '500' });
    assert.match(burnHash, /^0x[a-f0-9]{64}$/);
    assert.notEqual(burnHash, mintHash1);

    const forceHash = await forceTransfer(deployment, {
      from: sender,
      to: recipient,
      amount: '100'
    });
    const pauseHash = await pauseToken(deployment);
    const unpauseHash = await unpauseToken(deployment);
    assert.match(forceHash, /^0x[a-f0-9]{64}$/);
    assert.match(pauseHash, /^0x[a-f0-9]{64}$/);
    assert.match(unpauseHash, /^0x[a-f0-9]{64}$/);
    assert.notEqual(pauseHash, unpauseHash);
  });
});

test('mock-mode identity-registry returns deterministic txHashes', async () => {
  await withEnv({ BLOCKCHAIN_MOCK_MODE: 'true', NODE_ENV: 'development' }, async () => {
    const { registerIdentity, updateCountry, removeIdentity } =
      await import('@/lib/services/onchain/identity-registry');
    const deployment = {
      chainId: 31337,
      tokenAddress: '0x1234567890abcdef1234567890abcdef12345678' as const,
      identityRegistryAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const,
      complianceAddress: '0x1111111111222222222233333333334444444444' as const,
      countryRestrictModuleAddress: null as null
    };
    const wallet = '0x9999999999999999999999999999999999999999';

    const a = await registerIdentity(deployment, { wallet, countryCode: 410 });
    const b = await registerIdentity(deployment, { wallet, countryCode: 410 });
    const c = await registerIdentity(deployment, { wallet, countryCode: 840 });
    const update = await updateCountry(deployment, { wallet, countryCode: 410 });
    const remove = await removeIdentity(deployment, wallet);

    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, update);
    assert.notEqual(a, remove);
    for (const hash of [a, c, update, remove]) {
      assert.match(hash, /^0x[a-f0-9]{64}$/);
    }
  });
});

test('mock-mode compliance returns deterministic txHashes', async () => {
  await withEnv({ BLOCKCHAIN_MOCK_MODE: 'true', NODE_ENV: 'development' }, async () => {
    const { blockCountry, unblockCountry, addModule, removeModule } =
      await import('@/lib/services/onchain/compliance');
    const deployment = {
      chainId: 31337,
      tokenAddress: '0x1234567890abcdef1234567890abcdef12345678' as const,
      identityRegistryAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const,
      complianceAddress: '0x1111111111222222222233333333334444444444' as const,
      countryRestrictModuleAddress: null as null
    };
    const moduleAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const blockA = await blockCountry(deployment, 410);
    const blockB = await blockCountry(deployment, 410);
    const unblock = await unblockCountry(deployment, 410);
    const add = await addModule(deployment, moduleAddress);
    const remove = await removeModule(deployment, moduleAddress);

    assert.equal(blockA, blockB);
    assert.notEqual(blockA, unblock);
    assert.notEqual(add, remove);
    for (const hash of [blockA, unblock, add, remove]) {
      assert.match(hash, /^0x[a-f0-9]{64}$/);
    }
  });
});

test('mock-mode valuation-anchor produces a complete result without RPC', async () => {
  await withEnv({ BLOCKCHAIN_MOCK_MODE: 'true', NODE_ENV: 'development' }, async () => {
    const { anchorValuationOnchain } = await import('@/lib/services/onchain/valuation-anchor');
    const result = await anchorValuationOnchain({
      assetCode: 'TEST-ASSET-1',
      valuation: { baseCaseValueKrw: 1_000_000_000, asOf: '2026-04-28' },
      label: 'mock-test'
    });
    assert.match(result.documentHash, /^0x[a-f0-9]{64}$/);
    assert.match(result.txHash ?? '', /^0x[a-f0-9]{64}$/);
    assert.equal(result.assetCode, 'TEST-ASSET-1');
    assert.equal(result.alreadyAnchored, false);
    assert.ok(result.canonicalBytes > 0);
  });
});

test('getRegistryChainClients refuses to instantiate in mock mode', async () => {
  await withEnv({ BLOCKCHAIN_MOCK_MODE: 'true', NODE_ENV: 'development' }, async () => {
    const { getRegistryChainClients } = await import('@/lib/blockchain/client');
    assert.throws(() => getRegistryChainClients(), /mock mode/);
  });
});
