import { NextResponse } from 'next/server';
import { createDealCounterparty } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const counterparty = await createDealCounterparty(id, payload);
    return NextResponse.json(counterparty, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add counterparty' },
      { status: 400 }
    );
  }
}
