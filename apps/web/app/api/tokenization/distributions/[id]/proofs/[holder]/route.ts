import { NextResponse } from 'next/server';
import { getAllocationProof } from '@/lib/services/onchain/dividend-distributor';

/**
 * Public proof endpoint. A holder can fetch their (amount, proof) pair to
 * pass into `DividendDistributor.claim`. No auth — the proof is useless
 * without the matching wallet's signature, and the on-chain `claim` call
 * authenticates `msg.sender == leaf.holder` natively.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; holder: string }> }
) {
  const { id, holder } = await context.params;
  try {
    const allocation = await getAllocationProof({ distributionId: id, holder });
    if (!allocation) return NextResponse.json({ error: 'not allocated' }, { status: 404 });
    return NextResponse.json({
      distributionId: id,
      holder: allocation.holderAddress,
      amount: allocation.amount,
      proof: allocation.proof,
      claimed: Boolean(allocation.claimedAt),
      claimedAt: allocation.claimedAt,
      claimTxHash: allocation.claimTxHash
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'lookup failed' },
      { status: 400 }
    );
  }
}
