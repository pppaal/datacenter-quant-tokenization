import { NextResponse } from 'next/server';
import { closeOutDeal } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const deal = await closeOutDeal(id, payload);
    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to close out deal' },
      { status: 400 }
    );
  }
}
