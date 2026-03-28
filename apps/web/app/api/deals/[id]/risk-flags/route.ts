import { NextResponse } from 'next/server';
import { createDealRiskFlag } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const riskFlag = await createDealRiskFlag(id, payload);
    return NextResponse.json(riskFlag, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create risk flag' },
      { status: 400 }
    );
  }
}
