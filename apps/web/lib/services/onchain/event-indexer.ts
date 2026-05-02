/**
 * Chain → DB event indexer.
 *
 * Polls `getLogs(fromBlock = cursor + 1, toBlock = currentBlock - confirmations)`
 * for a configured set of (contractAddress, abi) pairs and persists each
 * decoded log into `OnchainEvent`. The cursor is bumped to the highest block
 * actually drained so a resumed run picks up exactly where the previous one
 * stopped.
 *
 * Idempotent: events are written via createMany({ skipDuplicates: true }) on
 * the `(chainId, txHash, logIndex)` unique key, so re-indexing the same range
 * (e.g. after a transient RPC failure) is safe.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Abi, AbiEvent, Address, Log, PublicClient } from 'viem';
import { decodeEventLog } from 'viem';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';

export type IndexerTarget = {
  contractAddress: Address;
  abi: Abi;
  /** Human-readable label persisted on the cursor row for ops debugging. */
  label: string;
  /** Block to start from on first run if no cursor exists yet. */
  fromBlock?: bigint;
};

export type IndexerResult = {
  contractAddress: Address;
  label: string;
  fromBlock: bigint;
  toBlock: bigint;
  inserted: number;
  skipped: number;
};

const DEFAULT_CONFIRMATIONS = 3n;
const MAX_BLOCK_RANGE = 5_000n;

function jsonifyArgs(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonifyArgs);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = jsonifyArgs(v);
    }
    return out;
  }
  return value;
}

function decodeOrNull(abi: Abi, log: Log): { eventName: string; args: unknown } | null {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics
    });
    if (typeof decoded.eventName !== 'string') return null;
    return { eventName: decoded.eventName, args: decoded.args ?? {} };
  } catch {
    return null;
  }
}

async function indexOne(
  publicClient: PublicClient,
  chainId: number,
  target: IndexerTarget,
  db: PrismaClient,
  options: { confirmations: bigint; maxRange: bigint }
): Promise<IndexerResult> {
  const cursor = await db.onchainEventCursor.upsert({
    where: { chainId_contractAddress: { chainId, contractAddress: target.contractAddress } },
    create: {
      chainId,
      contractAddress: target.contractAddress,
      label: target.label,
      lastBlock: target.fromBlock ?? 0n
    },
    update: { label: target.label }
  });

  const head = await publicClient.getBlockNumber();
  const safeHead = head > options.confirmations ? head - options.confirmations : 0n;
  const fromBlock = cursor.lastBlock + 1n;
  if (fromBlock > safeHead) {
    return {
      contractAddress: target.contractAddress,
      label: target.label,
      fromBlock,
      toBlock: cursor.lastBlock,
      inserted: 0,
      skipped: 0
    };
  }
  const toBlock =
    safeHead - fromBlock + 1n > options.maxRange ? fromBlock + options.maxRange - 1n : safeHead;

  const logs = await publicClient.getLogs({
    address: target.contractAddress,
    fromBlock,
    toBlock
  });

  const eventAbis = target.abi.filter((entry): entry is AbiEvent => entry.type === 'event');
  const decodeAbi = (eventAbis.length > 0 ? eventAbis : target.abi) as unknown as Abi;
  const rows: Prisma.OnchainEventCreateManyInput[] = [];
  let skipped = 0;
  for (const log of logs) {
    const decoded = decodeOrNull(decodeAbi, log);
    if (!decoded) {
      skipped += 1;
      continue;
    }
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
      skipped += 1;
      continue;
    }
    rows.push({
      chainId,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash ?? '',
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      contractAddress: target.contractAddress,
      eventName: decoded.eventName,
      args: jsonifyArgs(decoded.args) as Prisma.InputJsonValue
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    const result = await db.onchainEvent.createMany({ data: rows, skipDuplicates: true });
    inserted = result.count;
  }

  await db.onchainEventCursor.update({
    where: { chainId_contractAddress: { chainId, contractAddress: target.contractAddress } },
    data: { lastBlock: toBlock }
  });

  return {
    contractAddress: target.contractAddress,
    label: target.label,
    fromBlock,
    toBlock,
    inserted,
    skipped
  };
}

export type IndexEventsOptions = {
  targets: IndexerTarget[];
  db?: PrismaClient;
  publicClient?: PublicClient;
  chainId?: number;
  confirmations?: bigint;
  maxRange?: bigint;
};

/**
 * Drain pending events for every configured target. Returns one summary per
 * target. Mock mode short-circuits to an empty result so dev environments can
 * call the cron without a real RPC.
 */
export async function indexOnchainEvents(options: IndexEventsOptions): Promise<IndexerResult[]> {
  if (isTokenizationMockMode()) {
    return options.targets.map((t) => ({
      contractAddress: t.contractAddress,
      label: t.label,
      fromBlock: 0n,
      toBlock: 0n,
      inserted: 0,
      skipped: 0
    }));
  }

  const db = options.db ?? prisma;
  let publicClient = options.publicClient;
  let chainId = options.chainId;
  if (!publicClient || chainId === undefined) {
    const clients = getRegistryChainClients();
    publicClient = publicClient ?? clients.publicClient;
    chainId = chainId ?? clients.config.chainId;
  }
  const opts = {
    confirmations: options.confirmations ?? DEFAULT_CONFIRMATIONS,
    maxRange: options.maxRange ?? MAX_BLOCK_RANGE
  };

  const results: IndexerResult[] = [];
  for (const target of options.targets) {
    try {
      const result = await indexOne(publicClient, chainId, target, db, opts);
      results.push(result);
      logger.info('onchain.indexer.target_complete', {
        chainId,
        contract: target.contractAddress,
        label: target.label,
        fromBlock: result.fromBlock.toString(),
        toBlock: result.toBlock.toString(),
        inserted: result.inserted,
        skipped: result.skipped
      });
    } catch (error) {
      logger.error('onchain.indexer.target_failed', {
        chainId,
        contract: target.contractAddress,
        label: target.label,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  return results;
}
