import { NextResponse } from 'next/server';
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update lender quote' },
      { status: 400 }
    );
  }
}
