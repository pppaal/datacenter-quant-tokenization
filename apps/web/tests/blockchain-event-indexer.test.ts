import assert from 'node:assert/strict';
import test from 'node:test';
import type { Abi, Address, PublicClient } from 'viem';
import { indexOnchainEvents } from '@/lib/services/onchain/event-indexer';

// The indexer short-circuits in mock mode; tests exercise the live path with
// a fake PublicClient + DB, so unset the flag for this file's lifetime.
delete process.env.BLOCKCHAIN_MOCK_MODE;

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ],
    anonymous: false
  }
] as const satisfies Abi;

type CursorRow = {
  chainId: number;
  contractAddress: string;
  label: string;
  lastBlock: bigint;
};
type EventRow = {
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  txHash: string;
  logIndex: number;
  contractAddress: string;
  eventName: string;
  args: unknown;
};

function buildFakeDb() {
  const cursors = new Map<string, CursorRow>();
  const events = new Map<string, EventRow>();

  return {
    cursors,
    events,
    onchainEventCursor: {
      async upsert(args: {
        where: { chainId_contractAddress: { chainId: number; contractAddress: string } };
        create: CursorRow;
        update: { label: string };
      }) {
        const key = `${args.where.chainId_contractAddress.chainId}:${args.where.chainId_contractAddress.contractAddress}`;
        const existing = cursors.get(key);
        if (existing) {
          existing.label = args.update.label;
          return existing;
        }
        const fresh = { ...args.create };
        cursors.set(key, fresh);
        return fresh;
      },
      async update(args: {
        where: { chainId_contractAddress: { chainId: number; contractAddress: string } };
        data: { lastBlock: bigint };
      }) {
        const key = `${args.where.chainId_contractAddress.chainId}:${args.where.chainId_contractAddress.contractAddress}`;
        const existing = cursors.get(key);
        if (!existing) throw new Error('cursor not found');
        existing.lastBlock = args.data.lastBlock;
        return existing;
      }
    },
    onchainEvent: {
      async createMany(args: { data: EventRow[]; skipDuplicates: boolean }) {
        let count = 0;
        for (const row of args.data) {
          const key = `${row.chainId}:${row.txHash}:${row.logIndex}`;
          if (events.has(key)) continue;
          events.set(key, row);
          count += 1;
        }
        return { count };
      }
    }
  };
}

function buildFakePublicClient(opts: {
  blockNumber: bigint;
  logs: unknown[];
}): PublicClient {
  return {
    getBlockNumber: async () => opts.blockNumber,
    getLogs: async () => opts.logs
  } as unknown as PublicClient;
}

test('event indexer drains a fresh range and bumps cursor', async () => {
  const contract = '0x000000000000000000000000000000000000a1' as Address;
  const db = buildFakeDb();
  const logs = [
    {
      blockNumber: 100n,
      blockHash: '0x' + 'b'.repeat(64),
      transactionHash: '0x' + 'a'.repeat(64),
      logIndex: 0,
      address: contract,
      data: '0x' + (1234n).toString(16).padStart(64, '0'),
      topics: [
        TRANSFER_TOPIC,
        '0x' + '00'.repeat(12) + '11'.repeat(20),
        '0x' + '00'.repeat(12) + '22'.repeat(20)
      ]
    }
  ];

  const result = await indexOnchainEvents({
    targets: [{ contractAddress: contract, abi: TRANSFER_ABI as unknown as Abi, label: 'token' }],
    publicClient: buildFakePublicClient({ blockNumber: 110n, logs }),
    chainId: 31337,
    db: db as never,
    confirmations: 0n
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]!.inserted, 1);
  assert.equal(result[0]!.skipped, 0);
  assert.equal(db.events.size, 1);
  const cursor = db.cursors.get(`31337:${contract}`);
  assert.ok(cursor);
  assert.equal(cursor.lastBlock, 110n);
  const event = [...db.events.values()][0]!;
  assert.equal(event.eventName, 'Transfer');
  assert.equal(event.contractAddress, contract);
  assert.equal((event.args as { value: string }).value, '1234');
});

test('event indexer is idempotent on re-run with same logs', async () => {
  const contract = '0x000000000000000000000000000000000000a2' as Address;
  const db = buildFakeDb();
  const logs = [
    {
      blockNumber: 50n,
      blockHash: '0x' + 'c'.repeat(64),
      transactionHash: '0x' + 'd'.repeat(64),
      logIndex: 3,
      address: contract,
      data: '0x' + (7n).toString(16).padStart(64, '0'),
      topics: [
        TRANSFER_TOPIC,
        '0x' + '00'.repeat(12) + '33'.repeat(20),
        '0x' + '00'.repeat(12) + '44'.repeat(20)
      ]
    }
  ];

  // First run: cursor 0 → drains.
  await indexOnchainEvents({
    targets: [{ contractAddress: contract, abi: TRANSFER_ABI as unknown as Abi, label: 'token' }],
    publicClient: buildFakePublicClient({ blockNumber: 60n, logs }),
    chainId: 1,
    db: db as never,
    confirmations: 0n
  });
  assert.equal(db.events.size, 1);

  // Second run with the same logs at same block — cursor already past, nothing to insert.
  const r2 = await indexOnchainEvents({
    targets: [{ contractAddress: contract, abi: TRANSFER_ABI as unknown as Abi, label: 'token' }],
    publicClient: buildFakePublicClient({ blockNumber: 60n, logs: [] }),
    chainId: 1,
    db: db as never,
    confirmations: 0n
  });
  assert.equal(r2[0]!.inserted, 0);
  assert.equal(db.events.size, 1);
});
