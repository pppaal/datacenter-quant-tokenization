import { NextResponse } from 'next/server';
import { createRealizedOutcome } from '@/lib/services/realized-outcomes';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const asset = await createRealizedOutcome(id, payload);
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save realized outcome' },
      { status: 400 }
    );
  }
}
