import { NextResponse } from 'next/server';
import { createCapexLineItem } from '@/lib/services/capex-book';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const item = await createCapexLineItem(id, payload);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create CAPEX line item' },
      { status: 400 }
    );
  }
}
