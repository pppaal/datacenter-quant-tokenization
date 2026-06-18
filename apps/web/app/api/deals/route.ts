import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
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
    return validationOrGenericError(error, { message: 'Failed to create deal.' });
  }
}
