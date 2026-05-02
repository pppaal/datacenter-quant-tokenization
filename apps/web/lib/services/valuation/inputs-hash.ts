import { createHash } from 'node:crypto';
import { canonicalizeToJson } from '@/lib/services/onchain/canonicalize';

/**
 * Deterministic SHA-256 over (engineVersion, assumptions) used as the
 * `ValuationRun.inputsHash` column. Two runs with the same hash were
 * produced from the same engine version against identical assumptions and
 * therefore SHOULD yield identical scenarios — a downstream check can flag
 * any drift as engine non-determinism or hidden assumption mutation.
 *
 * Why hash here and not at the engine layer: the assumptions actually
 * persisted on `ValuationRun.assumptions` include a few inputs that are
 * derived inside this service (macro regime, credit signals) and are not
 * visible inside the strategy. The persisted blob is the audit-of-record;
 * the hash should match what's persisted, not the raw strategy input.
 */
export function computeValuationInputsHash(input: {
  engineVersion: string;
  assumptions: unknown;
}): string {
  const canonical = canonicalizeToJson({
    engineVersion: input.engineVersion,
    assumptions: input.assumptions
  });
  return createHash('sha256').update(canonical).digest('hex');
}
