import { NextResponse } from 'next/server';
import { updateDealStage } from '@/lib/services/deals';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const deal = await updateDealStage(id, payload);
    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update deal stage' },
      { status: 400 }
    );
  }
}
