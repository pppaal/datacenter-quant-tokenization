import { NextResponse } from 'next/server';
import { archiveDeal } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const deal = await archiveDeal(id, payload);
    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to archive deal' },
      { status: 400 }
    );
  }
}
