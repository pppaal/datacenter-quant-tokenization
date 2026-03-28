import { NextResponse } from 'next/server';
import { createDeal, listDeals } from '@/lib/services/deals';

export async function GET() {
  const deals = await listDeals();
  return NextResponse.json(deals);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const deal = await createDeal(payload);
    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create deal' },
      { status: 400 }
    );
  }
}
