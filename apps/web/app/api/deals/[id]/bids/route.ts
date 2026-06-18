import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { createDealBidRevision } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const bidRevision = await createDealBidRevision(id, body);
    return NextResponse.json({ bidRevision }, { status: 201 });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to create bid revision.' });
  }
}
