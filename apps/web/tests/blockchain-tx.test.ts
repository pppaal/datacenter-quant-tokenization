import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hex, PublicClient, TransactionReceipt } from 'viem';
import { TransactionRevertedError, awaitTxReceipt } from '@/lib/blockchain/tx';

const TX_HASH = ('0x' + 'a'.repeat(64)) as Hex;

function buildReceipt(status: 'success' | 'reverted'): TransactionReceipt {
  return {
    blockHash: ('0x' + 'b'.repeat(64)) as Hex,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 1n,
    from: '0x0000000000000000000000000000000000000001',
    gasUsed: 21000n,
    logs: [],
    logsBloom: ('0x' + '0'.repeat(512)) as Hex,
    status,
    to: '0x0000000000000000000000000000000000000002',
    transactionHash: TX_HASH,
    transactionIndex: 0,
    type: 'eip1559'
  } as unknown as TransactionReceipt;
}

function fakePublicClient(receipt: TransactionReceipt): PublicClient {
  return {
    waitForTransactionReceipt: async () => receipt
  } as unknown as PublicClient;
}

test('awaitTxReceipt returns the receipt when status is success', async () => {
  const receipt = buildReceipt('success');
  const result = await awaitTxReceipt(fakePublicClient(receipt), TX_HASH);
  assert.equal(result, receipt);
});

test('awaitTxReceipt throws TransactionRevertedError when status is reverted', async () => {
  const receipt = buildReceipt('reverted');
  await assert.rejects(
    () => awaitTxReceipt(fakePublicClient(receipt), TX_HASH, { label: 'mint' }),
    (error: unknown) => {
      assert.ok(error instanceof TransactionRevertedError);
      assert.equal(error.txHash, TX_HASH);
      assert.equal(error.label, 'mint');
      assert.equal(error.blockNumber, 1n);
      assert.equal(error.gasUsed, 21000n);
      assert.match(error.message, /reverted during mint/);
      return true;
    }
  );
});

test('awaitTxReceipt revert error omits label when none given', async () => {
  const receipt = buildReceipt('reverted');
  await assert.rejects(
    () => awaitTxReceipt(fakePublicClient(receipt), TX_HASH),
    (error: unknown) => {
      assert.ok(error instanceof TransactionRevertedError);
      assert.equal(error.label, undefined);
      assert.doesNotMatch(error.message, /during/);
      return true;
    }
  );
});
