import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { updateDealLenderQuote } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
    quoteId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { id, quoteId } = await params;
    const body = await request.json();
    const lenderQuote = await updateDealLenderQuote(id, quoteId, body);
    return NextResponse.json({ lenderQuote });
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update lender quote.' });
  }
}
