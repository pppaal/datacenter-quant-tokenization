import { createHash } from 'node:crypto';
import type { Hex } from 'viem';
import { isRealProduction } from '@/lib/runtime-env';

/**
 * Returns true when the deployment is allowed to short-circuit chain writes
 * through deterministic mock transactions. Mock mode is only honored outside a
 * real production runtime — `lib/services/readiness.ts` enforces the same
 * production hard-block, and this helper mirrors that contract for the
 * ERC-3643 tokenization stack.
 */
export function isTokenizationMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BLOCKCHAIN_MOCK_MODE?.trim().toLowerCase();
  const enabled = value === '1' || value === 'true' || value === 'yes';
  if (enabled && isRealProduction(env)) {
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
 *
 * `null` / `undefined` parts are dropped (so optional args don't shift the
 * hash). The remaining parts are length-prefixed before joining, so a part
 * that itself contains the delimiter cannot be confused with the boundary
 * between two parts — e.g. `('a', 'b:c')` and `('a:b', 'c')` must produce
 * distinct hashes. Without the length prefix both collapse to `"a:b:c"`,
 * which would let two logically different on-chain actions collide on the
 * same mock txHash.
 */
export function buildMockTxHash(...parts: Array<string | number | bigint | null | undefined>): Hex {
  const canonical = parts
    .filter((p) => p !== null && p !== undefined)
    .map((p) => {
      const s = String(p);
      return `${s.length}:${s}`;
    })
    .join('|');
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `0x${digest}` as Hex;
}
