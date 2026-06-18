import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateDealBidRevision } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
    bidId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { id, bidId } = await params;
    const body = await request.json();
    const bidRevision = await updateDealBidRevision(id, bidId, body);
    return NextResponse.json({ bidRevision });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update bid revision.' });
  }
}
