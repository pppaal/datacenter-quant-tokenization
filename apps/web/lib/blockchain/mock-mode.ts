import { createHash } from 'node:crypto';
import type { Hex } from 'viem';

/**
 * Returns true when the deployment is allowed to short-circuit chain writes
 * through deterministic mock transactions. Mock mode is only honored when
 * NODE_ENV is not production — `lib/services/readiness.ts` enforces the
 * production hard-block, and this helper mirrors that contract for the
 * ERC-3643 tokenization stack.
 */
export function isTokenizationMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BLOCKCHAIN_MOCK_MODE?.trim().toLowerCase();
  const enabled = value === '1' || value === 'true' || value === 'yes';
  if (enabled && env.NODE_ENV === 'production') {
    throw new Error(
      'BLOCKCHAIN_MOCK_MODE must not be enabled in production. Configure a real RPC + signer + tokenization deployment.'
    );
  }
  return enabled;
}

/**
 * Deterministically derive a 32-byte tx hash from the call site so
 * downstream consumers (audit log, UI) get a stable identifier they can
 * compare across replays.
 */
export function buildMockTxHash(...parts: Array<string | number | bigint | null | undefined>): Hex {
  const digest = createHash('sha256')
    .update(parts.filter((p) => p !== null && p !== undefined).join(':'))
    .digest('hex');
  return `0x${digest}` as Hex;
}
