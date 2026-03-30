import { NextResponse } from 'next/server';
import { createDealLenderQuote } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const lenderQuote = await createDealLenderQuote(id, body);
    return NextResponse.json({ lenderQuote }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create lender quote' },
      { status: 400 }
    );
  }
}
