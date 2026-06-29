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

type AbiParam = {
  type?: string;
  components?: ReadonlyArray<AbiParam>;
};

type AbiEntry = {
  type?: string;
  name?: string;
  inputs?: ReadonlyArray<AbiParam>;
  outputs?: ReadonlyArray<AbiParam>;
};

/**
 * Serialize a param type, recursing into tuple `components` so a struct's field
 * layout is part of the key — `tuple` alone would hide a field reorder/retype.
 * `tuple`, `tuple[]`, `tuple[N]` all carry their layout in `components`.
 */
function serializeType(param: AbiParam): string {
  const base = param.type ?? '?';
  if (base.startsWith('tuple') && param.components && param.components.length > 0) {
    const inner = param.components.map(serializeType).join(',');
    return `(${inner})${base.slice('tuple'.length)}`;
  }
  return base;
}

function signatureKey(entry: AbiEntry): string {
  const args = (entry.inputs ?? []).map(serializeType).join(',');
  // Include OUTPUT types too: the view functions (getAsset/getDocument) return
  // structs, and a return-struct drift (field reorder/retype) would otherwise go
  // undetected because the key matched on name + argument types only.
  const rets = (entry.outputs ?? []).map(serializeType).join(',');
  return `${entry.type ?? '?'}:${entry.name ?? '_'}(${args}):(${rets})`;
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
