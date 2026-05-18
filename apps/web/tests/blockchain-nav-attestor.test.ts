import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareNavAttestation } from '@/lib/blockchain/nav-attestor';

const DOMAIN = {
  name: 'NavAttestor',
  version: '1',
  chainId: 84532n,
  verifyingContract: '0x2222222222222222222222222222222222222222' as const
};

const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const RUN = {
  id: 'run-attest-test',
  baseCaseValueKrw: 259_936_015_008,
  createdAt: new Date('2026-04-30T05:20:20.000Z')
};
const ASSET = { assetCode: 'SEOUL-GANGSEO-01' };

test('prepareNavAttestation produces signature + digest + mock txHash in mock mode', async (t) => {
  process.env.BLOCKCHAIN_MOCK_MODE = 'true';
  t.after(() => {
    delete process.env.BLOCKCHAIN_MOCK_MODE;
  });

  const result = await prepareNavAttestation({
    valuationRun: RUN,
    asset: ASSET,
    domain: DOMAIN,
    signerPrivateKey: PRIVATE_KEY
  });

  assert.equal(result.mocked, true);
  assert.equal(result.signature.length, 132);
  assert.equal(result.digest.length, 66);
  assert.match(result.txHash, /^0x[0-9a-f]{64}$/);
  // Same input → same mock tx hash (determinism)
  const result2 = await prepareNavAttestation({
    valuationRun: RUN,
    asset: ASSET,
    domain: DOMAIN,
    signerPrivateKey: PRIVATE_KEY
  });
  assert.equal(result.txHash, result2.txHash);
});

test('prepareNavAttestation flips mocked=false outside mock mode', async (t) => {
  delete process.env.BLOCKCHAIN_MOCK_MODE;
  t.after(() => undefined);

  const result = await prepareNavAttestation({
    valuationRun: RUN,
    asset: ASSET,
    domain: DOMAIN,
    signerPrivateKey: PRIVATE_KEY
  });

  assert.equal(result.mocked, false);
  // Without on-chain submission, txHash is the zero hash placeholder
  assert.match(result.txHash, /^0x0+$/);
  // But the signature + digest are real
  assert.equal(result.signature.length, 132);
});

test('attestation signer matches the private key derivation', async () => {
  const result = await prepareNavAttestation({
    valuationRun: RUN,
    asset: ASSET,
    domain: DOMAIN,
    signerPrivateKey: PRIVATE_KEY
  });
  // The address derived from anvil[0] is well-known
  assert.equal(
    result.signer.toLowerCase(),
    '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
  );
});
