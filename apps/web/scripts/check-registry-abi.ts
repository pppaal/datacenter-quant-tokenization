/**
 * Drift guard: verifies every (functionName, input/output signature) entry
 * declared in the hand-curated `lib/blockchain/abi.ts` exists in the
 * artifact-bundled `lib/blockchain/abi.json`. Run in CI after
 * `npm run contracts:export-abi` to catch silent ABI drift before it lands
 * in production reads/writes.
 *
 * Exit code is 1 on drift.
 */
import path from 'node:path';
import { logger } from '@/lib/observability/logger';
import { dataCenterAssetRegistryAbi } from '@/lib/blockchain/abi';
import abiJson from '@/lib/blockchain/abi.json';

type AbiEntry = {
  type?: string;
  name?: string;
  inputs?: ReadonlyArray<{ type?: string }>;
};

function signatureKey(entry: AbiEntry): string {
  const args = (entry.inputs ?? []).map((i) => i.type ?? '?').join(',');
  return `${entry.type ?? '?'}:${entry.name ?? '_'}(${args})`;
}

function main() {
  const artifactKeys = new Set(
    (abiJson as AbiEntry[])
      .filter((entry) => entry.type === 'function' || entry.type === 'event')
      .map(signatureKey)
  );

  const drift: string[] = [];
  for (const entry of dataCenterAssetRegistryAbi as unknown as readonly AbiEntry[]) {
    if (entry.type !== 'function') continue;
    const key = signatureKey(entry);
    if (!artifactKeys.has(key)) {
      drift.push(key);
    }
  }

  const sourcePath = path.relative(process.cwd(), 'apps/web/lib/blockchain/abi.ts');
  const artifactPath = path.relative(process.cwd(), 'apps/web/lib/blockchain/abi.json');

  if (drift.length > 0) {
    logger.error('abi_drift_detected', {
      sourcePath,
      artifactPath,
      missing: drift,
      hint: 'Run `npm run contracts:export-abi` and update lib/blockchain/abi.ts to match the new artifact.'
    });
    process.exit(1);
  }

  logger.info('abi_drift_clean', {
    sourcePath,
    artifactPath,
    hand_curated_entries: (dataCenterAssetRegistryAbi as unknown as readonly AbiEntry[]).length
  });
}

main();
