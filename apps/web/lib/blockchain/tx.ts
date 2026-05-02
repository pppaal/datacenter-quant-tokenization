import type { Hex, PublicClient, TransactionReceipt } from 'viem';

export class TransactionRevertedError extends Error {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly gasUsed: bigint;
  readonly label: string | undefined;

  constructor(receipt: TransactionReceipt, label?: string) {
    super(
      `Transaction ${receipt.transactionHash} reverted${label ? ` during ${label}` : ''} ` +
        `(block ${receipt.blockNumber}, gasUsed ${receipt.gasUsed}).`
    );
    this.name = 'TransactionRevertedError';
    this.txHash = receipt.transactionHash;
    this.blockNumber = receipt.blockNumber;
    this.gasUsed = receipt.gasUsed;
    this.label = label;
  }
}

/**
 * Wait for a transaction receipt and assert that the EVM did not revert.
 *
 * `viem.waitForTransactionReceipt` resolves on a *mined* receipt regardless of
 * whether the transaction succeeded or reverted. Callers that store `txHash`
 * in the DB as proof of an action MUST gate persistence on this check, or the
 * UI will report success for a transaction the chain rejected.
 */
export async function awaitTxReceipt(
  publicClient: PublicClient,
  txHash: Hex,
  options?: { label?: string }
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new TransactionRevertedError(receipt, options?.label);
  }
  return receipt;
}
