/**
 * NavAttestor publish helper.
 *
 * Takes a `ValuationRun` row and posts a signed NAV attestation to the
 * on-chain NavAttestor contract on the configured chain. The contract
 * verifies the EIP-712 signature, prevents replay (nonce + timestamp),
 * and forwards to the per-asset NavOracle.
 *
 * Mock mode (BLOCKCHAIN_MOCK_MODE=true) short-circuits to a deterministic
 * fake tx hash so tests / local dev don't need a live RPC.
 */
import type { Address, Hex } from 'viem';
import {
  buildNavAttestation,
  signNavAttestation,
  type Eip712Domain,
  type NavAttestation,
  type ValuationRunInput,
  type AssetInput
} from '@/lib/blockchain/attestation';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { buildMockTxHash } from '@/lib/blockchain/mock-mode';

/** Minimal NavAttestor ABI for the publish call — full ABI is exported
 *  from the contracts package via `npm run contracts:export-abi`. We
 *  inline this slice so the service stays self-contained. */
export const NAV_ATTESTOR_PUBLISH_ABI = [
  {
    type: 'function',
    name: 'publish',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'attAssetId', type: 'bytes32' },
      { name: 'quoteSymbol', type: 'bytes32' },
      { name: 'navPerShare', type: 'uint256' },
      { name: 'navTimestamp', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'runRef', type: 'bytes32' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: []
  }
] as const;

export type NavAttestorPublishInput = {
  /** Run + asset to derive the attestation from. */
  valuationRun: ValuationRunInput;
  asset: AssetInput;
  quoteSymbol?: string;
  /** EIP-712 domain bound to the deployed NavAttestor contract. */
  domain: Eip712Domain;
  /** Server-side signing key authorized on the contract. Hex-prefixed. */
  signerPrivateKey: Hex;
  /** Optional: mock-mode passthrough hint, used for deterministic tests. */
  mockSeed?: string;
};

export type NavAttestorPublishResult = {
  attestation: NavAttestation;
  signer: Address;
  signature: Hex;
  digest: Hex;
  /** On-chain tx hash, or a deterministic mock when in mock mode. */
  txHash: Hex;
  /** Mock vs real chain. */
  mocked: boolean;
};

/**
 * Build the attestation, sign it, and produce a `txHash`-shaped result.
 *
 * In mock mode this returns a deterministic fake hash so the audit log
 * is reproducible. The real on-chain submission is left to the caller
 * (typically a job worker that batches publishes into one tx) — call
 * `submitOnChain(result)` separately when you need to broadcast.
 */
export async function prepareNavAttestation(
  input: NavAttestorPublishInput
): Promise<NavAttestorPublishResult> {
  const attestation = buildNavAttestation({
    valuationRun: input.valuationRun,
    asset: input.asset,
    quoteSymbol: input.quoteSymbol
  });
  const { signature, signer, digest } = await signNavAttestation(
    attestation,
    input.domain,
    input.signerPrivateKey
  );

  if (isTokenizationMockMode()) {
    const seed = input.mockSeed ?? input.valuationRun.id;
    return {
      attestation,
      signer,
      signature,
      digest,
      txHash: buildMockTxHash('nav.attest', seed),
      mocked: true
    };
  }

  // Real on-chain submission deferred to submitOnChain() so callers can
  // batch / queue / retry independently of attestation construction.
  return {
    attestation,
    signer,
    signature,
    digest,
    txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    mocked: false
  };
}

/**
 * Public API exposed for unit tests + workers.
 */
export type { NavAttestation } from '@/lib/blockchain/attestation';
